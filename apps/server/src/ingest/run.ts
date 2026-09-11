/**
 * Fetching both feeds and writing what they say.
 *
 * The impure half of ingestion. Everything that decides anything lives in the
 * pure modules beside this one and is tested there; this fetches, calls them, and
 * writes. Keeping the decisions out of here is what makes the data rules testable
 * without a database.
 *
 * **Reference data only**, so every write here uses the service key. Nothing in
 * this file touches a table with a user posture (ADR 0007).
 */

import { fetchProjections } from '../ffiq/feed.js'
import { ensureShirtNumbers } from '../pl/shirt-numbers.js'
import { fetchBootstrap, fetchFixtures } from '../fpl/feed.js'
import { referenceClient } from '../supabase.js'
import { reportFixtureAnomalies, toFixtureRows } from './fixtures.js'
import { gameweekToAdviseOn, toGameweekRows } from './gameweeks.js'
import { toClubRows, toPlayerRows, toPlayerStateRows } from './players.js'
import { toProjectionRows } from './projections.js'

/** How many gameweeks of fixtures to keep. Three, because the strip needs three. */
const HORIZON = 3

export type IngestResult = {
  gameweek: number
  clubs: number
  players: number
  fixtures: number
  projections: number
}

/**
 * One pass over both feeds.
 *
 * Order matters and it is foreign keys, not preference: clubs before players,
 * gameweeks before fixtures, both before projections.
 */
export async function ingestWorld(log: (message: string) => void = console.warn): Promise<IngestResult> {
  const db = referenceClient()

  const [bootstrap, fixturesPayload, ffiq] = await Promise.all([
    fetchBootstrap<Parameters<typeof toGameweekRows>[0] & Parameters<typeof toClubRows>[0]>(),
    fetchFixtures<Parameters<typeof toFixtureRows>[0]>(),
    fetchProjections<Parameters<typeof toProjectionRows>[0]>(),
  ])

  const bootstrapRead = await recordRead(db, 'fpl_bootstrap')
  const ffiqRead = await recordRead(db, 'ffiq')

  const gameweeks = toGameweekRows(bootstrap)
  const next = gameweekToAdviseOn(gameweeks)

  await upsert(db, 'gameweek', gameweeks.map((g) => ({
    id: g.id,
    name: g.name,
    deadline_time: g.deadlineTime,
    is_next: g.isNext,
    is_current: g.isCurrent,
    finished: g.finished,
    data_checked: g.dataChecked,
  })))

  const clubs = toClubRows(bootstrap)
  await upsert(db, 'club', clubs.map((c) => ({ id: c.id, name: c.name, short_name: c.shortName })))

  const players = toPlayerRows(bootstrap)
  await upsert(db, 'player', players.map((p) => ({
    id: p.id,
    club_id: p.clubId,
    position: p.position,
    first_name: p.firstName,
    surname: p.surname,
    shirt_number: p.shirtNumber,
  })))

  // Shirt numbers come from a third source, and only when they are missing — see
  // pl/shirt-numbers.ts. The join is opta_code, which is in hand here and stored
  // nowhere, so this is the one place it can be done without a new column.
  await ensureShirtNumbers(
    async () => {
      const { count } = await db
        .from('player')
        .select('id', { count: 'exact', head: true })
        .not('shirt_number', 'is', null)
      return count ?? 0
    },
    bootstrap.elements.map((e) => ({ id: e.id, optaCode: e.opta_code ?? null })),
    async (numbers) => {
      for (const n of numbers) {
        await db.from('player').update({ shirt_number: n.shirtNumber }).eq('id', n.id)
      }
    },
    log,
  )

  // Every player FPL tracks, not only the fifteen — F6-RS-05 needs a player who
  // was never proposed to be able to surface as a new candidate.
  await upsert(db, 'player_state', toPlayerStateRows(bootstrap, bootstrapRead).map((s) => ({
    feed_read_id: s.feedReadId,
    player_id: s.playerId,
    status: s.status,
    news: s.news,
    news_added: s.newsAdded,
    chance_of_playing_next_round: s.chanceOfPlayingNextRound,
    now_cost_tenths: s.nowCostTenths,
    form: s.form,
    selected_by_percent: s.selectedByPercent,
    season_points: s.seasonPoints,
    transfers_in: s.transfersIn,
    transfers_out: s.transfersOut,
    cost_change_start_tenths: s.costChangeStartTenths,
    price_change_percent: s.priceChangePercent,
    price_change_likelihood_tonight: s.priceChangeLikelihoodTonight,
    price_change_locked_until: s.priceChangeLockedUntil,
  })))

  const horizon = new Set(Array.from({ length: HORIZON }, (_, i) => next.id + i))
  const fixtures = toFixtureRows(fixturesPayload).filter((f) => horizon.has(f.gameweek))
  await upsert(db, 'fixture', fixtures.map((f) => ({
    id: f.id,
    gameweek: f.gameweek,
    home_club: f.homeClub,
    away_club: f.awayClub,
    kickoff: f.kickoff,
    home_difficulty: f.homeDifficulty,
    away_difficulty: f.awayDifficulty,
    finished: f.finished,
  })))

  // The first real blank or double has to announce itself. It cannot be observed
  // live this early in a season, so silence here is expected and informative.
  reportFixtureAnomalies(fixtures, next.id, clubs.map((c) => c.id), log)

  const knownPlayers = new Set(players.map((p) => p.id))
  const projections = toProjectionRows(ffiq, ffiqRead)
    .filter((p) => horizon.has(p.gameweek) && knownPlayers.has(p.playerId))
  await upsert(db, 'projection', projections.map((p) => ({
    gameweek: p.gameweek,
    player_id: p.playerId,
    projected_points: p.projectedPoints,
    feed_read_id: p.feedReadId,
  })))

  return {
    gameweek: next.id,
    clubs: clubs.length,
    players: players.length,
    fixtures: fixtures.length,
    projections: projections.length,
  }
}

/** One row per fetch. The raw payload is storage, never prompt input (ADR 0009). */
async function recordRead(
  db: ReturnType<typeof referenceClient>,
  source: 'fpl_bootstrap' | 'fpl_fixtures' | 'ffiq',
): Promise<string> {
  const { data, error } = await db
    .from('feed_read')
    .insert({ source, succeeded: true })
    .select('id')
    .single()
  if (error) throw new Error(`could not record ${source} read: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Chunked, because a single insert of every player FPL tracks is large enough to
 * be refused, and a partial write here is worse than a slow one.
 */
async function upsert(
  db: ReturnType<typeof referenceClient>,
  table: string,
  rows: Record<string, unknown>[],
  chunk = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + chunk))
    if (error) throw new Error(`could not write ${table}: ${error.message}`)
  }
}
