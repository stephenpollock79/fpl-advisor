/**
 * The one object every screen re-derives from.
 *
 * Pure: rows in, world out. The database reads that feed it happen at the route,
 * so the join between the two feeds — the part of this slice most able to look
 * like working software while being wrong — is testable without a database.
 *
 * **What this does not carry.** No squad or bench point totals: those are summed
 * from the players shown, at render, so no total can disagree with the players it
 * represents (F1-AC-22). No formation: derived from the starting eleven and never
 * stored (F1-AC-03).
 */

import type { FixtureRow } from '../ingest/fixtures.js'
import type { GameweekRow } from '../ingest/gameweeks.js'
import type { ClubRow, PlayerRow, PlayerStateRow } from '../ingest/players.js'
import type { ProjectionRow } from '../ingest/projections.js'
import { effectiveProjection } from '../ingest/projections.js'
import type { SquadPlayer } from '../squad/snapshot.js'

/** How many gameweeks of difficulty the stat table's strip shows (F1-AC-19). */
const DIFFICULTY_HORIZON = 3

export type WorldFixture = {
  opponentClubId: number
  opponentShortName: string
  isHome: boolean
  difficulty: number
}

export type WorldPlayer = {
  playerId: number
  surname: string
  shirtNumber: number | null
  clubId: number
  clubShortName: string
  position: PlayerRow['position']
  isStarter: boolean
  benchOrder: 0 | 1 | 2 | 3 | null
  isCaptain: boolean
  isVice: boolean
  status: string
  chanceOfPlayingNextRound: number | null
  nowCostTenths: number
  form: number | null
  selectedByPercent: number | null
  seasonPoints: number | null
  transfersIn: number | null
  transfersOut: number | null
  /** One figure for the gameweek, already covering however many matches it holds. */
  projectedPoints: number
  /** Zero entries for a blank, one normally, two for a double. */
  fixtures: WorldFixture[]
  /**
   * Difficulty for this gameweek and the two after it. Null is a blank — never
   * zero, which would colour as the easiest fixture there is. An array is a
   * double, whose first bar splits in two.
   */
  nextThree: (number | number[] | null)[]
}

export type World = {
  gameweek: { id: number; name: string; deadlineTime: string }
  lastScoredGameweek: number | null
  snapshot: {
    id: string
    source: string
    capturedAt: string
    bankTenths: number
    freeTransfers: number
    chipsRemaining: Record<string, string>
  }
  players: WorldPlayer[]
  blanks: number
  doubles: number
  attribution: { name: string; href: string }
}

export type WorldParts = {
  gameweek: GameweekRow
  lastScored: GameweekRow | null
  snapshot: World['snapshot']
  squad: SquadPlayer[]
  players: PlayerRow[]
  clubs: ClubRow[]
  fixtures: FixtureRow[]
  projections: ProjectionRow[]
  states: PlayerStateRow[]
}

export function assembleWorld(parts: WorldParts): World {
  const playerById = new Map(parts.players.map((p) => [p.id, p]))
  const clubById = new Map(parts.clubs.map((c) => [c.id, c]))
  const stateById = new Map(parts.states.map((s) => [s.playerId, s]))
  const projectionByKey = new Map(
    parts.projections.map((p) => [`${p.gameweek}:${p.playerId}`, p.projectedPoints]),
  )

  let blanks = 0
  let doubles = 0

  const players = parts.squad.map((entry) => {
    const player = playerById.get(entry.playerId)
    if (!player) throw new Error(`Squad names player ${entry.playerId}, which the feed does not list.`)

    const thisWeek = clubFixtures(parts.fixtures, player.clubId, parts.gameweek.id, clubById)
    if (thisWeek.length === 0) blanks += 1
    if (thisWeek.length > 1) doubles += 1

    const state = stateById.get(entry.playerId)

    return {
      playerId: player.id,
      surname: player.surname,
      shirtNumber: player.shirtNumber,
      clubId: player.clubId,
      clubShortName: clubById.get(player.clubId)?.shortName ?? '',
      position: player.position,
      isStarter: entry.isStarter,
      benchOrder: entry.benchOrder,
      isCaptain: entry.isCaptain,
      isVice: entry.isVice,
      status: state?.status ?? 'a',
      chanceOfPlayingNextRound: state?.chanceOfPlayingNextRound ?? null,
      nowCostTenths: state?.nowCostTenths ?? 0,
      form: state?.form ?? null,
      selectedByPercent: state?.selectedByPercent ?? null,
      seasonPoints: state?.seasonPoints ?? null,
      transfersIn: state?.transfersIn ?? null,
      transfersOut: state?.transfersOut ?? null,
      // **The count decides, not the feed.** A club with no fixture projects zero
      // whatever the projections carry; a double keeps its single figure.
      projectedPoints: effectiveProjection({
        projectedPoints: projectionByKey.get(`${parts.gameweek.id}:${player.id}`) ?? 0,
        fixtureCount: thisWeek.length,
      }),
      fixtures: thisWeek,
      nextThree: difficultyStrip(parts.fixtures, player.clubId, parts.gameweek.id, clubById),
    }
  })

  return {
    gameweek: {
      id: parts.gameweek.id,
      name: parts.gameweek.name,
      deadlineTime: parts.gameweek.deadlineTime,
    },
    lastScoredGameweek: parts.lastScored?.id ?? null,
    snapshot: parts.snapshot,
    players,
    blanks,
    doubles,
    // A licence condition, not a courtesy.
    attribution: { name: 'Fantasy Football IQ', href: 'https://fantasyfootballiq.app' },
  }
}

/**
 * A club's fixtures in one gameweek, from the fixture table and nowhere else.
 *
 * Difficulty is always the one facing *this* club. Reading the opponent's column
 * would colour every pill from the other team's point of view, which is wrong in a
 * way that looks plausible.
 */
function clubFixtures(
  fixtures: FixtureRow[],
  clubId: number,
  gameweek: number,
  clubById: Map<number, ClubRow>,
): WorldFixture[] {
  return fixtures
    .filter((f) => f.gameweek === gameweek && (f.homeClub === clubId || f.awayClub === clubId))
    .map((f) => {
      const isHome = f.homeClub === clubId
      const opponentClubId = isHome ? f.awayClub : f.homeClub
      return {
        opponentClubId,
        opponentShortName: clubById.get(opponentClubId)?.shortName ?? '',
        isHome,
        difficulty: isHome ? f.homeDifficulty : f.awayDifficulty,
      }
    })
}

/** This gameweek's difficulty and the two after it (F1-AC-19). */
function difficultyStrip(
  fixtures: FixtureRow[],
  clubId: number,
  from: number,
  clubById: Map<number, ClubRow>,
): (number | number[] | null)[] {
  return Array.from({ length: DIFFICULTY_HORIZON }, (_, offset) => {
    const week = clubFixtures(fixtures, clubId, from + offset, clubById)
    if (week.length === 0) return null
    if (week.length === 1) return week[0]?.difficulty ?? null
    return week.map((f) => f.difficulty)
  })
}
