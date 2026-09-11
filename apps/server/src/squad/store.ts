/**
 * Writing the manager's squad, as the manager.
 *
 * The snapshot and its fifteen rows are user data, so both are written with the
 * signed-in user's own token and never the service key (ADR 0007). The service
 * key is not merely discouraged here — it has no grant on either table, so this
 * would fail if it tried.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { referenceClient, userClient } from '../supabase.js'
import { latestReadId } from '../world/reads.js'
import {
  type PriceNow,
  type TransferRecord,
  chipsRemaining,
  freeTransfersRemaining,
  purchasePrices,
  toSquadPlayers,
} from './snapshot.js'

const FPL_API = 'https://fantasy.premierleague.com/api'

/**
 * Fetch the squad as at the last completed deadline and store it.
 *
 * Public endpoints only, by team id. The manager's FPL account is never read and
 * no credential exists to read it with (F7-AC-13).
 *
 * `gameweek` is the one being advised on — always the next, never the current —
 * while `picksFrom` is the last completed gameweek, because that is the most
 * recent squad FPL will disclose. The gap between those two is exactly what F2's
 * screenshot correction exists to close.
 */
export async function captureSquad(
  user: AuthenticatedUser,
  fplTeamId: number,
  gameweek: number,
  picksFrom: number,
): Promise<string> {
  const [picks, history, transfers] = await Promise.all([
    getJson(`/entry/${fplTeamId}/event/${picksFrom}/picks/`),
    getJson(`/entry/${fplTeamId}/history/`),
    getJson<TransferRecord[]>(`/entry/${fplTeamId}/transfers/`),
  ])

  const players = toSquadPlayers(picks['picks'] as Parameters<typeof toSquadPlayers>[0])
  const entryHistory = (picks['entry_history'] ?? {}) as Record<string, number>
  const typedHistory = history as unknown as Parameters<typeof chipsRemaining>[0]

  // Purchase prices (F3-AC-26, STE-87). The world has just been ingested, so
  // the latest read carries every price this needs.
  const paid = purchasePrices(
    players.map((p) => p.playerId),
    transfers,
    typedHistory.chips,
    await pricesNow(players.map((p) => p.playerId)),
  )

  const db = userClient(user.accessToken)

  const { data, error } = await db
    .from('squad_snapshot')
    .insert({
      user_id: user.userId,
      gameweek,
      source: 'fpl_deadline',
      bank_tenths: entryHistory['bank'] ?? 0,
      free_transfers: freeTransfersRemaining(typedHistory, gameweek),
      chips_remaining: chipsRemaining(typedHistory),
    })
    .select('id')
    .single()

  if (error) throw new Error(`could not store the squad: ${error.message}`)
  const snapshotId = (data as { id: string }).id

  const { error: playersError } = await db.from('squad_player').insert(
    players.map((p) => ({
      snapshot_id: snapshotId,
      user_id: user.userId,
      player_id: p.playerId,
      is_starter: p.isStarter,
      bench_order: p.benchOrder,
      is_captain: p.isCaptain,
      is_vice: p.isVice,
      purchase_price_tenths: paid.get(p.playerId) ?? null,
    })),
  )
  if (playersError) throw new Error(`could not store the fifteen: ${playersError.message}`)

  return snapshotId
}

/**
 * Fill any purchase price the current squad is missing.
 *
 * A squad captured before slice 5 has none at all, and a player captured before
 * the feed carried `cost_change_start` has none either. Recovered the same way
 * as at capture — never guessed — and a price that still cannot be found stays
 * null, so that player is simply not offered for sale.
 */
export async function fillMissingPurchasePrices(user: AuthenticatedUser): Promise<void> {
  const db = userClient(user.accessToken)

  const { data: next } = await referenceClient().from('gameweek').select('id').eq('is_next', true).limit(1)
  const gameweek = (next as { id: number }[] | null)?.[0]?.id
  if (gameweek === undefined) return

  const { data: snapshots } = await db
    .from('squad_snapshot')
    .select('id')
    .eq('gameweek', gameweek)
    .is('superseded_at', null)
    .order('captured_at', { ascending: false })
    .limit(1)
  const snapshotId = (snapshots as { id: string }[] | null)?.[0]?.id
  if (!snapshotId) return

  const { data: rows } = await db
    .from('squad_player')
    .select('player_id, purchase_price_tenths')
    .eq('snapshot_id', snapshotId)
  const missing = ((rows ?? []) as { player_id: number; purchase_price_tenths: number | null }[])
    .filter((r) => r.purchase_price_tenths === null)
    .map((r) => r.player_id)
  if (missing.length === 0) return

  const { data: manager } = await db.from('manager').select('fpl_team_id').maybeSingle()
  const fplTeamId = (manager as { fpl_team_id: number | null } | null)?.fpl_team_id
  if (!fplTeamId) return

  const [history, transfers] = await Promise.all([
    getJson(`/entry/${fplTeamId}/history/`),
    getJson<TransferRecord[]>(`/entry/${fplTeamId}/transfers/`),
  ])
  const chips = ((history as { chips?: { name: string; event: number }[] }).chips ?? [])
  const paid = purchasePrices(missing, transfers, chips, await pricesNow(missing))

  for (const [playerId, price] of paid) {
    if (price === null) continue
    const { error } = await db
      .from('squad_player')
      .update({ purchase_price_tenths: price })
      .eq('snapshot_id', snapshotId)
      .eq('player_id', playerId)
    if (error) throw new Error(`could not store a purchase price: ${error.message}`)
  }
}

/** Each player's price now and his movement since gameweek 1, from the latest read. */
async function pricesNow(playerIds: number[]): Promise<Map<number, PriceNow>> {
  const readId = await latestReadId('fpl_bootstrap')
  if (!readId) return new Map()
  const { data } = await referenceClient()
    .from('player_state')
    .select('player_id, now_cost_tenths, cost_change_start_tenths')
    .eq('feed_read_id', readId)
    .in('player_id', playerIds)

  const prices = new Map<number, PriceNow>()
  for (const row of (data ?? []) as { player_id: number; now_cost_tenths: number; cost_change_start_tenths: number | null }[]) {
    // Without the movement since gameweek 1 there is no gameweek-1 price to
    // recover. Leave him out, and the purchase price stays unknown.
    if (row.cost_change_start_tenths === null) continue
    prices.set(row.player_id, { nowCostTenths: row.now_cost_tenths, costChangeStartTenths: row.cost_change_start_tenths })
  }
  return prices
}

async function getJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const response = await fetch(`${FPL_API}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`FPL ${path} responded ${response.status}`)
  return (await response.json()) as T
}
