/**
 * Everything one run needs, read from the database.
 *
 * **The squad is read with the signed-in user's token; the world with the
 * service key. Never the other way round** (ADR 0007).
 *
 * Every player FPL tracks is loaded, not only the fifteen — the transfer search
 * needs the whole pool, and F6-RS-05 needs a player never proposed to be able to
 * surface. Projections are taken whole (ENGINE-AC-01), and a player whose club
 * has no fixture in a gameweek projects zero for it whatever the feed carries:
 * the fixture table owns the count (CLAUDE.md, data rules 1 and 3).
 */

import { type FplStatus, availabilityOf, sellingPriceTenths } from '@fpl/engine'
import type { AuthenticatedUser } from '../auth/session.js'
import type { PlanPlayer, SquadEntry } from '../calls/plan.js'
import { gameweekToAdviseOn, toGameweekRows } from '../ingest/gameweeks.js'
import { effectiveProjection } from '../ingest/projections.js'
import { referenceClient, userClient } from '../supabase.js'
import { everyRow, latestReadId } from '../world/reads.js'
import type { CardInfo } from './generate.js'
import type { WeekInputs } from './routes.js'

type Row = Record<string, unknown>

const HORIZON = 3

export async function loadWeek(user: AuthenticatedUser): Promise<WeekInputs | null> {
  const reference = referenceClient()
  const mine = userClient(user.accessToken)

  const { data: gameweekRows } = await reference
    .from('gameweek')
    .select('id, name, deadline_time, is_next, is_current, finished, data_checked')
  const gameweeks = toGameweekRows({
    events: ((gameweekRows ?? []) as Row[]).map((g) => ({
      id: g['id'] as number,
      name: g['name'] as string,
      deadline_time: g['deadline_time'] as string,
      is_next: g['is_next'] as boolean,
      is_current: g['is_current'] as boolean,
      finished: g['finished'] as boolean,
      data_checked: g['data_checked'] as boolean,
    })),
  })
  if (gameweeks.length === 0) return null
  // is_next, never is_current (CLAUDE.md, the gameweek foot-guns).
  const gameweek = gameweekToAdviseOn(gameweeks).id

  const { data: snapshots } = await mine
    .from('squad_snapshot')
    .select('id, bank_tenths, free_transfers')
    .eq('gameweek', gameweek)
    .is('superseded_at', null)
    .order('captured_at', { ascending: false })
    .limit(1)
  const snapshot = (snapshots as Row[] | null)?.[0]
  if (!snapshot) return null

  const { data: squadRows } = await mine
    .from('squad_player')
    .select('player_id, is_starter, bench_order, purchase_price_tenths')
    .eq('snapshot_id', snapshot['id'] as string)

  const readId = await latestReadId('fpl_bootstrap')
  if (!readId) return null

  const horizon = Array.from({ length: HORIZON }, (_, i) => gameweek + i)

  const [players, clubs, fixtures, states, ...projectionsByWeek] = await Promise.all([
    everyRow<Row>((from, to) => reference.from('player').select('id, club_id, position, surname').range(from, to)),
    everyRow<Row>((from, to) => reference.from('club').select('id, short_name').range(from, to)),
    everyRow<Row>((from, to) =>
      reference.from('fixture').select('gameweek, home_club, away_club, home_difficulty, away_difficulty').in('gameweek', horizon).range(from, to),
    ),
    everyRow<Row>((from, to) =>
      reference
        .from('player_state')
        .select('player_id, status, chance_of_playing_next_round, now_cost_tenths, form, selected_by_percent, season_points, transfers_in, transfers_out')
        .eq('feed_read_id', readId)
        .range(from, to),
    ),
    ...horizon.map((week) =>
      everyRow<Row>((from, to) =>
        reference.from('projection').select('player_id, projected_points').eq('gameweek', week).range(from, to),
      ),
    ),
  ])

  const clubName = new Map(clubs.map((c) => [c['id'] as number, c['short_name'] as string]))
  const stateOf = new Map(states.map((s) => [s['player_id'] as number, s]))
  const projectionOf = projectionsByWeek.map(
    (rows) => new Map(rows.map((r) => [r['player_id'] as number, Number(r['projected_points'])])),
  )

  /** A club's fixtures in one gameweek, from the fixture table and nowhere else. */
  const fixturesOf = (clubId: number, week: number) =>
    fixtures
      .filter((f) => f['gameweek'] === week && (f['home_club'] === clubId || f['away_club'] === clubId))
      .map((f) => {
        const isHome = f['home_club'] === clubId
        return {
          opponent: clubName.get((isHome ? f['away_club'] : f['home_club']) as number) ?? '',
          isHome,
          difficulty: (isHome ? f['home_difficulty'] : f['away_difficulty']) as number,
        }
      })

  const planPlayers = new Map<number, PlanPlayer>()
  const cards = new Map<number, CardInfo>()

  for (const p of players) {
    const id = p['id'] as number
    const clubId = p['club_id'] as number
    const state = stateOf.get(id)
    if (!state) continue // Not in the latest read: FPL no longer tracks him.

    const status = (state['status'] as string) ?? 'a'
    const chance = (state['chance_of_playing_next_round'] as number | null) ?? null
    const availability = availabilityOf({ status: status as FplStatus, chanceOfPlayingNextRound: chance })
    const thisWeek = fixturesOf(clubId, gameweek)
    const projections = horizon.map((week, i) =>
      effectiveProjection({
        projectedPoints: projectionOf[i]?.get(id) ?? 0,
        fixtureCount: fixturesOf(clubId, week).length,
      }),
    )
    const nowCostTenths = state['now_cost_tenths'] as number

    planPlayers.set(id, {
      playerId: id,
      position: p['position'] as PlanPlayer['position'],
      clubId,
      projections,
      availability,
      flagged: status === 'd',
      hasFixture: thisWeek.length > 0,
      nowCostTenths,
    })

    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    cards.set(id, {
      name: p['surname'] as string,
      club: clubName.get(clubId) ?? '',
      status,
      availability,
      chanceOfPlayingNextRound: chance,
      form: num(state['form']),
      projection: projections[0] ?? 0,
      fixtures: thisWeek,
      priceTenths: nowCostTenths,
      selectedByPercent: num(state['selected_by_percent']),
      seasonPoints: num(state['season_points']),
      transfersIn: num(state['transfers_in']),
      transfersOut: num(state['transfers_out']),
    })
  }

  const squad: SquadEntry[] = ((squadRows ?? []) as Row[]).map((r) => {
    const id = r['player_id'] as number
    const player = planPlayers.get(id)
    if (!player) throw new Error(`Squad names player ${String(id)}, whom the latest read does not track.`)
    const purchase = r['purchase_price_tenths'] as number | null
    return {
      ...player,
      isStarter: r['is_starter'] as boolean,
      benchOrder: r['bench_order'] as SquadEntry['benchOrder'],
      // Unknown stays unknown: a player whose purchase price cannot be found is
      // not offered for sale, rather than sold at a guessed price (F3-AC-25).
      sellingPriceTenths: purchase === null ? null : sellingPriceTenths(purchase, player.nowCostTenths),
    }
  })

  const inSquad = new Set(squad.map((s) => s.playerId))

  return {
    gameweek,
    snapshotId: snapshot['id'] as string,
    plan: {
      squad,
      pool: [...planPlayers.values()].filter((p) => !inSquad.has(p.playerId)),
      bankTenths: snapshot['bank_tenths'] as number,
      freeTransfers: snapshot['free_transfers'] as number,
    },
    cards,
  }
}
