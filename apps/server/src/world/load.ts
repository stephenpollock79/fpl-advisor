/**
 * Reading the world back, with the rule that decides which key reads what.
 *
 * **User data is read with the signed-in user's own token; reference data with
 * the service key. Never the other way round** (ADR 0007). The service key
 * carries BYPASSRLS, so a read that used it for the squad would pass every test
 * asserting the policies exist while providing none of the isolation those
 * policies are for — and nothing on screen would look wrong.
 *
 * The split is visible in this file as two different clients, deliberately.
 *
 * **Player state is read from the latest successful feed read only.** The table
 * holds one set per read; reading every set and keeping whichever row came last
 * would let a stale price or a cleared injury win (world/reads.ts).
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { referenceClient, userClient } from '../supabase.js'
import { toGameweekRows, gameweekToAdviseOn, lastScoredGameweek } from '../ingest/gameweeks.js'
import type { WorldCall, WorldParts } from './assemble.js'
import { latestReadId } from './reads.js'

type Row = Record<string, unknown>

export async function loadWorldParts(user: AuthenticatedUser): Promise<WorldParts | null> {
  const reference = referenceClient()
  const mine = userClient(user.accessToken)

  const { data: gameweekRows } = await reference
    .from('gameweek')
    .select('id, name, deadline_time, is_next, is_current, finished, data_checked')

  const gameweeks = toGameweekRows({
    events: (gameweekRows ?? []).map((g: Row) => ({
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

  const gameweek = gameweekToAdviseOn(gameweeks)

  // The manager's own rows, read as the manager. A superseded snapshot is one a
  // correction replaced; it is kept rather than deleted so a disclosure line can
  // never point at a squad that no longer exists.
  const { data: snapshots } = await mine
    .from('squad_snapshot')
    .select('id, source, captured_at, bank_tenths, free_transfers, chips_remaining')
    .eq('gameweek', gameweek.id)
    .is('superseded_at', null)
    .order('captured_at', { ascending: false })
    .limit(1)

  const snapshot = snapshots?.[0] as Row | undefined
  if (!snapshot) return null

  const [{ data: squadRows }, { data: runRows }, { data: decisionRows }] = await Promise.all([
    mine
      .from('squad_player')
      .select('player_id, is_starter, bench_order, is_captain, is_vice, purchase_price_tenths')
      .eq('snapshot_id', snapshot['id'] as string),
    // The latest *succeeded* run. A failed run never ages or replaces the
    // advice (F6-AC-14, NFR Reliability).
    mine
      .from('run')
      .select('id, finished_at')
      .eq('gameweek', gameweek.id)
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(1),
    mine.from('decision').select('call_key, state').eq('gameweek', gameweek.id),
  ])

  const squad = (squadRows ?? []).map((r: Row) => ({
    playerId: r['player_id'] as number,
    isStarter: r['is_starter'] as boolean,
    benchOrder: r['bench_order'] as 0 | 1 | 2 | 3 | null,
    isCaptain: r['is_captain'] as boolean,
    isVice: r['is_vice'] as boolean,
    purchasePriceTenths: (r['purchase_price_tenths'] as number | null) ?? null,
  }))

  const run = (runRows as Row[] | null)?.[0]
  const { data: callRows } = run
    ? await mine.from('call').select('*').eq('run_id', run['id'] as string).order('position')
    : { data: [] as Row[] }

  const calls: WorldCall[] = ((callRows ?? []) as Row[]).map((c) => ({
    key: c['call_key'] as string,
    category: c['category'] as WorldCall['category'],
    shape: c['shape'] as WorldCall['shape'],
    outPlayerId: c['out_player_id'] as number,
    inPlayerId: c['in_player_id'] as number,
    net: Number(c['net']),
    conviction: c['conviction'] as number,
    band: c['band'] as WorldCall['band'],
    k: Number(c['k_used']),
    pointsHit: c['points_hit'] as number,
    costTenths: c['cost_tenths'] as number,
    isForced: c['is_forced'] as boolean,
    watch: c['watch_flag'] as boolean,
    watchReason: (c['watch_reason'] as string | null) ?? null,
    reasoning: c['reasoning'] as string,
    reasoningSource: c['reasoning_source'] as WorldCall['reasoningSource'],
    breakdown: c['breakdown'],
    alternatives: (c['alternatives'] as WorldCall['alternatives']) ?? null,
    position: c['position'] as number,
  }))

  const squadIds = squad.map((s) => s.playerId)
  const candidateIds = [
    ...new Set(
      calls.flatMap((c) => [c.outPlayerId, c.inPlayerId, ...(c.alternatives?.in ?? []), ...(c.alternatives?.out ?? [])]),
    ),
  ].filter((id) => !squadIds.includes(id))
  const playerIds = [...squadIds, ...candidateIds]
  const horizon = [gameweek.id, gameweek.id + 1, gameweek.id + 2]
  const readId = await latestReadId('fpl_bootstrap')

  const stateQuery = reference
    .from('player_state')
    .select('feed_read_id, player_id, status, news, news_added, chance_of_playing_next_round, now_cost_tenths, form, selected_by_percent, season_points, transfers_in, transfers_out, cost_change_start_tenths, price_change_likelihood_tonight, price_change_locked_until')
    .in('player_id', playerIds)

  const [{ data: playerRows }, { data: clubRows }, { data: fixtureRows }, { data: projectionRows }, { data: stateRows }] =
    await Promise.all([
      reference.from('player').select('id, club_id, position, first_name, surname, shirt_number').in('id', playerIds),
      reference.from('club').select('id, name, short_name'),
      reference.from('fixture').select('id, gameweek, home_club, away_club, kickoff, home_difficulty, away_difficulty, finished').in('gameweek', horizon),
      reference.from('projection').select('gameweek, player_id, projected_points, feed_read_id').in('gameweek', horizon).in('player_id', playerIds),
      readId ? stateQuery.eq('feed_read_id', readId) : stateQuery,
    ])

  return {
    gameweek,
    lastScored: lastScoredGameweek(gameweeks),
    snapshot: {
      id: snapshot['id'] as string,
      source: snapshot['source'] as string,
      capturedAt: snapshot['captured_at'] as string,
      bankTenths: snapshot['bank_tenths'] as number,
      freeTransfers: snapshot['free_transfers'] as number,
      chipsRemaining: snapshot['chips_remaining'] as Record<string, string>,
    },
    squad,
    players: (playerRows ?? []).map((p: Row) => ({
      id: p['id'] as number,
      clubId: p['club_id'] as number,
      position: p['position'] as 'GKP' | 'DEF' | 'MID' | 'FWD',
      firstName: p['first_name'] as string,
      surname: p['surname'] as string,
      shirtNumber: p['shirt_number'] as number | null,
    })),
    clubs: (clubRows ?? []).map((c: Row) => ({
      id: c['id'] as number,
      name: c['name'] as string,
      shortName: c['short_name'] as string,
    })),
    fixtures: (fixtureRows ?? []).map((f: Row) => ({
      id: f['id'] as number,
      gameweek: f['gameweek'] as number,
      homeClub: f['home_club'] as number,
      awayClub: f['away_club'] as number,
      kickoff: f['kickoff'] as string | null,
      homeDifficulty: f['home_difficulty'] as number,
      awayDifficulty: f['away_difficulty'] as number,
      finished: f['finished'] as boolean,
    })),
    projections: (projectionRows ?? []).map((p: Row) => ({
      gameweek: p['gameweek'] as number,
      playerId: p['player_id'] as number,
      projectedPoints: Number(p['projected_points']),
      feedReadId: p['feed_read_id'] as string,
    })),
    states: (stateRows ?? []).map((s: Row) => ({
      feedReadId: s['feed_read_id'] as string,
      playerId: s['player_id'] as number,
      status: s['status'] as string,
      news: s['news'] as string | null,
      newsAdded: s['news_added'] as string | null,
      chanceOfPlayingNextRound: s['chance_of_playing_next_round'] as number | null,
      nowCostTenths: s['now_cost_tenths'] as number,
      form: s['form'] === null ? null : Number(s['form']),
      selectedByPercent: s['selected_by_percent'] === null ? null : Number(s['selected_by_percent']),
      seasonPoints: s['season_points'] as number | null,
      transfersIn: s['transfers_in'] as number | null,
      transfersOut: s['transfers_out'] as number | null,
      costChangeStartTenths: s['cost_change_start_tenths'] as number | null,
      priceChangeLikelihoodTonight: (s['price_change_likelihood_tonight'] as number | null) ?? null,
      priceChangeLockedUntil: (s['price_change_locked_until'] as string | null) ?? null,
    })),
    calls,
    decisions: ((decisionRows ?? []) as Row[]).map((d) => ({
      callKey: d['call_key'] as string,
      state: d['state'] as 'selected' | 'rejected',
    })),
    candidateIds,
    lastRunAt: (run?.['finished_at'] as string | undefined) ?? null,
  }
}
