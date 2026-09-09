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
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { referenceClient, userClient } from '../supabase.js'
import { toGameweekRows, gameweekToAdviseOn, lastScoredGameweek } from '../ingest/gameweeks.js'
import type { WorldParts } from './assemble.js'

export async function loadWorldParts(user: AuthenticatedUser): Promise<WorldParts | null> {
  const reference = referenceClient()
  const mine = userClient(user.accessToken)

  const { data: gameweekRows } = await reference
    .from('gameweek')
    .select('id, name, deadline_time, is_next, is_current, finished, data_checked')

  const gameweeks = toGameweekRows({
    events: (gameweekRows ?? []).map((g: Record<string, unknown>) => ({
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

  const snapshot = snapshots?.[0] as Record<string, unknown> | undefined
  if (!snapshot) return null

  const { data: squadRows } = await mine
    .from('squad_player')
    .select('player_id, is_starter, bench_order, is_captain, is_vice')
    .eq('snapshot_id', snapshot['id'] as string)

  const squad = (squadRows ?? []).map((r: Record<string, unknown>) => ({
    playerId: r['player_id'] as number,
    isStarter: r['is_starter'] as boolean,
    benchOrder: r['bench_order'] as 0 | 1 | 2 | 3 | null,
    isCaptain: r['is_captain'] as boolean,
    isVice: r['is_vice'] as boolean,
  }))

  const playerIds = squad.map((s) => s.playerId)
  const horizon = [gameweek.id, gameweek.id + 1, gameweek.id + 2]

  const [{ data: playerRows }, { data: clubRows }, { data: fixtureRows }, { data: projectionRows }, { data: stateRows }] =
    await Promise.all([
      reference.from('player').select('id, club_id, position, first_name, surname, shirt_number').in('id', playerIds),
      reference.from('club').select('id, name, short_name'),
      reference.from('fixture').select('id, gameweek, home_club, away_club, kickoff, home_difficulty, away_difficulty, finished').in('gameweek', horizon),
      reference.from('projection').select('gameweek, player_id, projected_points, feed_read_id').eq('gameweek', gameweek.id).in('player_id', playerIds),
      reference.from('player_state').select('feed_read_id, player_id, status, news, news_added, chance_of_playing_next_round, now_cost_tenths, form, selected_by_percent, season_points, transfers_in, transfers_out').in('player_id', playerIds),
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
    players: (playerRows ?? []).map((p: Record<string, unknown>) => ({
      id: p['id'] as number,
      clubId: p['club_id'] as number,
      position: p['position'] as 'GKP' | 'DEF' | 'MID' | 'FWD',
      firstName: p['first_name'] as string,
      surname: p['surname'] as string,
      shirtNumber: p['shirt_number'] as number | null,
    })),
    clubs: (clubRows ?? []).map((c: Record<string, unknown>) => ({
      id: c['id'] as number,
      name: c['name'] as string,
      shortName: c['short_name'] as string,
    })),
    fixtures: (fixtureRows ?? []).map((f: Record<string, unknown>) => ({
      id: f['id'] as number,
      gameweek: f['gameweek'] as number,
      homeClub: f['home_club'] as number,
      awayClub: f['away_club'] as number,
      kickoff: f['kickoff'] as string | null,
      homeDifficulty: f['home_difficulty'] as number,
      awayDifficulty: f['away_difficulty'] as number,
      finished: f['finished'] as boolean,
    })),
    projections: (projectionRows ?? []).map((p: Record<string, unknown>) => ({
      gameweek: p['gameweek'] as number,
      playerId: p['player_id'] as number,
      projectedPoints: Number(p['projected_points']),
      feedReadId: p['feed_read_id'] as string,
    })),
    states: (stateRows ?? []).map((s: Record<string, unknown>) => ({
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
    })),
  }
}
