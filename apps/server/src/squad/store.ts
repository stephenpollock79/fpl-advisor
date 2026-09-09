/**
 * Writing the manager's squad, as the manager.
 *
 * The snapshot and its fifteen rows are user data, so both are written with the
 * signed-in user's own token and never the service key (ADR 0007). The service
 * key is not merely discouraged here — it has no grant on either table, so this
 * would fail if it tried.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { userClient } from '../supabase.js'
import { chipsRemaining, freeTransfersRemaining, toSquadPlayers } from './snapshot.js'

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
  const [picks, history] = await Promise.all([
    getJson(`/entry/${fplTeamId}/event/${picksFrom}/picks/`),
    getJson(`/entry/${fplTeamId}/history/`),
  ])

  const players = toSquadPlayers(picks['picks'] as Parameters<typeof toSquadPlayers>[0])
  const entryHistory = (picks['entry_history'] ?? {}) as Record<string, number>
  const typedHistory = history as unknown as Parameters<typeof chipsRemaining>[0]

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
    })),
  )
  if (playersError) throw new Error(`could not store the fifteen: ${playersError.message}`)

  return snapshotId
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${FPL_API}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`FPL ${path} responded ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}
