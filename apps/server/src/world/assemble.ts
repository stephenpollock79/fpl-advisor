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
 * stored (F1-AC-03). And no call figure recomputed: net, conviction and band are
 * passed through exactly as the engine produced them and the run stored them
 * (ENGINE-AC-04).
 */

import { type Band, sellingPriceTenths } from '@fpl/engine'
import type { FixtureRow } from '../ingest/fixtures.js'
import type { GameweekRow } from '../ingest/gameweeks.js'
import type { ClubRow, PlayerRow, PlayerStateRow } from '../ingest/players.js'
import type { ProjectionRow } from '../ingest/projections.js'
import { effectiveProjection } from '../ingest/projections.js'
import type { SquadPlayer } from '../squad/snapshot.js'

/** How many gameweeks of difficulty and projection a player carries (F1-AC-19, F3-AC-24). */
const HORIZON = 3

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
  /**
   * This gameweek and the two after, each zero where the club has no fixture —
   * the count wins, never the feed. What a transfer is scored over, and what the
   * card recomputes from when a candidate is swapped (F3-AC-24).
   */
  projections: number[]
  /** Zero entries for a blank, one normally, two for a double. */
  fixtures: WorldFixture[]
  /**
   * Difficulty for this gameweek and the two after it. Null is a blank — never
   * zero, which would colour as the easiest fixture there is. An array is a
   * double, whose first bar splits in two.
   */
  nextThree: (number | number[] | null)[]
  /** What the manager paid (F3-AC-26). Null outside the squad, or where it could not be recovered. */
  purchasePriceTenths: number | null
  /** FPL's selling price, from the engine (F3-AC-25). Never computed in the client. */
  sellingPriceTenths: number | null
  /** FPL's likelihood of a price change tonight, −5 to +5 (STE-117). */
  priceLikelihoodTonight: number | null
  /** When FPL's lock on this player's price lifts, after a recent change. */
  priceLockedUntil: string | null
}

export type WorldCall = {
  key: string
  category: 'transfer' | 'substitution'
  shape: 'transfer' | 'forced_swap' | 'doubt_swap' | 'upgrade_swap' | 'bench_order'
  outPlayerId: number
  inPlayerId: number
  net: number
  conviction: number
  band: Band
  k: number
  pointsHit: number
  costTenths: number
  isForced: boolean
  watch: boolean
  /** Why WATCH is set, one tap away (F3-AC-18). Null when it is not. */
  watchReason: string | null
  reasoning: string
  reasoningSource: 'model' | 'template'
  breakdown: unknown
  alternatives: { out: number[]; in: number[] } | null
  position: number
}

export type DecisionState = 'selected' | 'rejected'

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
  /** Players outside the squad that a call or a picker names — the cards need their figures. */
  candidates: WorldPlayer[]
  /** The latest succeeded run's calls, in the plan's order. Empty before the first run. */
  calls: WorldCall[]
  /** This gameweek's decisions, by call key. A pending call has no entry (F3-AC-01). */
  decisions: Record<string, DecisionState>
  /** When the latest succeeded run finished — never a failed one (F6-AC-14). */
  lastRunAt: string | null
  /** When the FPL read the players' figures come from was taken — WATCH's "tonight" is only as fresh as this. */
  priceForecastReadAt: string | null
  blanks: number
  doubles: number
  attribution: { name: string; href: string }
}

export type WorldParts = {
  gameweek: GameweekRow
  lastScored: GameweekRow | null
  snapshot: World['snapshot']
  squad: (SquadPlayer & { purchasePriceTenths?: number | null })[]
  players: PlayerRow[]
  clubs: ClubRow[]
  fixtures: FixtureRow[]
  projections: ProjectionRow[]
  states: PlayerStateRow[]
  calls?: WorldCall[]
  decisions?: { callKey: string; state: DecisionState }[]
  /** Ids of non-squad players to carry as candidates. */
  candidateIds?: number[]
  lastRunAt?: string | null
  priceForecastReadAt?: string | null
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

  const view = (player: PlayerRow, entry: WorldParts['squad'][number] | null): WorldPlayer => {
    const thisWeek = clubFixtures(parts.fixtures, player.clubId, parts.gameweek.id, clubById)
    const state = stateById.get(player.id)
    const nowCostTenths = state?.nowCostTenths ?? 0
    const purchase = entry?.purchasePriceTenths ?? null

    // **The count decides, not the feed.** A club with no fixture projects zero
    // whatever the projections carry; a double keeps its single figure.
    const projections = Array.from({ length: HORIZON }, (_, offset) => {
      const week = parts.gameweek.id + offset
      return effectiveProjection({
        projectedPoints: projectionByKey.get(`${week}:${player.id}`) ?? 0,
        fixtureCount: clubFixtures(parts.fixtures, player.clubId, week, clubById).length,
      })
    })

    return {
      playerId: player.id,
      surname: player.surname,
      shirtNumber: player.shirtNumber,
      clubId: player.clubId,
      clubShortName: clubById.get(player.clubId)?.shortName ?? '',
      position: player.position,
      isStarter: entry?.isStarter ?? false,
      benchOrder: entry?.benchOrder ?? null,
      isCaptain: entry?.isCaptain ?? false,
      isVice: entry?.isVice ?? false,
      status: state?.status ?? 'a',
      chanceOfPlayingNextRound: state?.chanceOfPlayingNextRound ?? null,
      nowCostTenths,
      form: state?.form ?? null,
      selectedByPercent: state?.selectedByPercent ?? null,
      seasonPoints: state?.seasonPoints ?? null,
      transfersIn: state?.transfersIn ?? null,
      transfersOut: state?.transfersOut ?? null,
      projectedPoints: projections[0] ?? 0,
      projections,
      fixtures: thisWeek,
      nextThree: difficultyStrip(parts.fixtures, player.clubId, parts.gameweek.id, clubById),
      purchasePriceTenths: purchase,
      sellingPriceTenths: purchase === null || nowCostTenths === 0 ? null : sellingPriceTenths(purchase, nowCostTenths),
      priceLikelihoodTonight: state?.priceChangeLikelihoodTonight ?? null,
      priceLockedUntil: state?.priceChangeLockedUntil ?? null,
    }
  }

  const players = parts.squad.map((entry) => {
    const player = playerById.get(entry.playerId)
    if (!player) throw new Error(`Squad names player ${entry.playerId}, which the feed does not list.`)

    const view_ = view(player, entry)
    if (view_.fixtures.length === 0) blanks += 1
    if (view_.fixtures.length > 1) doubles += 1
    return view_
  })

  const inSquad = new Set(parts.squad.map((s) => s.playerId))
  const candidates = [...new Set(parts.candidateIds ?? [])]
    .filter((id) => !inSquad.has(id))
    .map((id) => playerById.get(id))
    .filter((p): p is PlayerRow => p !== undefined)
    .map((p) => view(p, null))

  return {
    gameweek: {
      id: parts.gameweek.id,
      name: parts.gameweek.name,
      deadlineTime: parts.gameweek.deadlineTime,
    },
    lastScoredGameweek: parts.lastScored?.id ?? null,
    snapshot: parts.snapshot,
    players,
    candidates,
    calls: [...(parts.calls ?? [])].sort((a, b) => a.position - b.position),
    decisions: Object.fromEntries((parts.decisions ?? []).map((d) => [d.callKey, d.state])),
    lastRunAt: parts.lastRunAt ?? null,
    priceForecastReadAt: parts.priceForecastReadAt ?? null,
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
  return Array.from({ length: HORIZON }, (_, offset) => {
    const week = clubFixtures(fixtures, clubId, from + offset, clubById)
    if (week.length === 0) return null
    if (week.length === 1) return week[0]?.difficulty ?? null
    return week.map((f) => f.difficulty)
  })
}
