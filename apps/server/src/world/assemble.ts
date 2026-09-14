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
 *
 * **What it does carry, since slice 7: every stored call re-derived from the read
 * this world was built on.** Not a second implementation — `recomputeCall` calls
 * the engine's one function, so ENGINE-AC-04 holds exactly as before. The reason
 * it happens here is that a figure the manager can see must never contradict the
 * data shown beside it, and re-deriving is free (ruled 2026-09-14, STE-65).
 * Nothing is added, dropped or decided: this is not a refresh.
 */

import { type Band, type CallIdentity, type FplStatus, availabilityOf, sellingPriceTenths } from '@fpl/engine'
import { checkGameweek } from '../gameweek/guard.js'
import { type Recomputed, type SideNow, type StoredFigure, recomputeCall } from '../refresh/recompute.js'
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
  category: 'transfer' | 'substitution' | 'captaincy'
  shape: 'transfer' | 'forced_swap' | 'doubt_swap' | 'upgrade_swap' | 'bench_order' | 'captain' | 'vice'
  outPlayerId: number
  inPlayerId: number
  net: number
  /**
   * A keep reading — the app's answer is *nothing to do* (F4-AC-01, F4-AC-02).
   * It carries no conviction and no band: rendering one with a percentage is the
   * weak-change display the criteria forbid, so the fields are null rather than
   * zero, and every surface has to say which it is holding.
   */
  isReading: boolean
  readingReason: 'incumbent_wins' | 'below_floor' | null
  conviction: number | null
  band: Band | null
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
  /**
   * What a refresh or a recomputation did to this call, until the card has been
   * seen (F6-AC-13). Transient by design — a tag that never clears stops meaning
   * anything, and one held only in the browser is lost on every reload.
   */
  diffTag: 'new' | 'updated' | 'returned' | 'resurfaced' | 'band_move' | null
  /** What the band moved from — "was 84%, now 71%" (F6-AC-11). Null unless it moved. */
  previousConviction: number | null
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
  /**
   * **The week being advised on has already been played** (F6-UP-03, STE-65).
   * Not staleness and not a prompt: the advice is void, and the screen says so
   * with no way to dismiss it. Absent when the week is fine.
   */
  gameweekStop?: { reason: 'deadline_passed' | 'projections_disagree'; gameweek: number; deadline: string }
  /**
   * Whether the feeds answered on this open (F6-UP-02). False is not an error:
   * the squad, the prices and the decisions are on file and still true, and only
   * what needs a fresh read is frozen. The screen says which.
   */
  feedsReachable?: boolean
  /** When the data on screen was read, for the screen to timestamp itself with. */
  dataReadAt?: string | null
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
  /** Which gameweek's picks the snapshot holds. Null on rows written before slice 7. */
  picksFrom?: number | null
  /** The clock, passed in so the check stays pure (ADR 0006's spirit). */
  nowMs?: number
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
    // **The figures follow the data** (ruled 2026-09-14). Every stored call is
    // re-derived from the read this world was built on, for nothing — it is
    // arithmetic over published inputs, and no model is involved. Nothing is
    // added, dropped or decided here, so this is not a refresh.
    calls: refreshedCalls([...(parts.calls ?? [])].sort((a, b) => a.position - b.position), [
      ...players,
      ...candidates,
    ]),
    decisions: Object.fromEntries((parts.decisions ?? []).map((d) => [d.callKey, d.state])),
    lastRunAt: parts.lastRunAt ?? null,
    priceForecastReadAt: parts.priceForecastReadAt ?? null,
    // **Run here, where the gameweek and the projections are both in hand.**
    // The check existed from the day this slice landed and nothing called it,
    // so the failure it was written for — confident advice about a week already
    // played, with nothing on screen looking wrong — was still uncaught.
    ...stopFor(parts),
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


/**
 * Every stored call, with its figures re-derived from the world as it stands.
 *
 * `previousConviction` and `diffTag` are carried onto the call for the card's
 * transient tag (F6-AC-13). They are computed rather than read from the row
 * because the row's tag belongs to the last *run*, and this is a figure moving
 * between runs — the two must not overwrite each other.
 */
function refreshedCalls(calls: readonly WorldCall[], world: readonly WorldPlayer[]): WorldCall[] {
  if (calls.length === 0) return []

  const sides = new Map<number, SideNow>(
    world.map((p) => [
      p.playerId,
      {
        playerId: p.playerId,
        projections: p.projections,
        availability: availabilityOf({ status: p.status as FplStatus, chanceOfPlayingNextRound: p.chanceOfPlayingNextRound }),
        hasFixture: p.fixtures.length > 0,
        inSquad: p.isStarter || p.benchOrder !== null,
        priceTenths: p.nowCostTenths,
        sellingPriceTenths: p.sellingPriceTenths,
      },
    ]),
  )

  return calls.map((call) => {
    const again = safeRecompute(
      {
        key: call.key,
        identity: identityOf(call),
        outPlayerId: call.outPlayerId,
        inPlayerId: call.inPlayerId,
        conviction: call.conviction,
        band: call.band,
        isReading: call.isReading,
        pointsHit: call.pointsHit,
      },
      sides,
    )

    // A call naming a player this world does not carry cannot be re-derived, and
    // is left exactly as the run stored it rather than being shown as broken on
    // the strength of a lookup miss.
    if (again.unexecutable && !sides.has(call.outPlayerId)) return call

    return {
      ...call,
      net: again.net,
      isReading: again.isReading || again.unexecutable,
      readingReason: again.isReading || again.unexecutable ? (call.readingReason ?? 'incumbent_wins') : null,
      conviction: again.conviction,
      band: again.band,
      previousConviction: again.previousConviction,
      diffTag: again.unexecutable ? 'returned' : again.movedBand ? 'band_move' : (call.diffTag ?? null),
    }
  })
}

/** The identity a stored call was built from, rebuilt from what the row carries. */
function identityOf(call: WorldCall): CallIdentity {
  switch (call.shape) {
    case 'transfer':
      return { type: 'transfer', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    case 'captain':
      return { type: 'captain', fromPlayerId: call.outPlayerId, toPlayerId: call.inPlayerId }
    case 'vice':
      return { type: 'vice', fromPlayerId: call.outPlayerId, toPlayerId: call.inPlayerId }
    case 'bench_order':
      // Slots are not on the row; the key already holds them and nothing here
      // rebuilds it, so the pair stands in for the identity's arithmetic only.
      return { type: 'bench_order', slotA: 0, slotB: 1 }
    default:
      return {
        type: 'substitution',
        variant: call.shape === 'forced_swap' ? 'forced' : call.shape === 'doubt_swap' ? 'doubt' : 'upgrade',
        outPlayerId: call.outPlayerId,
        inPlayerId: call.inPlayerId,
      }
  }
}


/**
 * One call's figures, re-derived — or the ones the run stored, where it cannot be.
 *
 * **The world is read on every screen, so an unguarded throw here is the whole
 * app down.** That is not hypothetical: on 2026-09-14 a transfer was re-derived
 * without its prices, the engine refused it as it should, and every read
 * returned a 500 until the first refresh's calls were in the database. Keeping
 * the stored figure is honest — it is what the run computed from published data
 * — and a card a moment stale beats a screen that will not load.
 */
function safeRecompute(call: StoredFigure, sides: Map<number, SideNow>): Recomputed {
  try {
    return recomputeCall(call, sides)
  } catch (cause) {
    console.error(`[world] could not re-derive ${call.key}; keeping the stored figure`, cause)
    return {
      key: call.key,
      net: 0,
      conviction: call.conviction,
      band: call.band,
      isReading: call.isReading,
      previousConviction: null,
      movedBand: false,
      unexecutable: false,
    }
  }
}


/**
 * Is the gameweek this world advises on still ahead of us?
 *
 * `projectionsCover` is the set of gameweeks the loaded projections actually
 * carry rows for. A file that does not cover the week being advised on is two
 * sources contradicting each other rather than one being old, and that is worth
 * stopping for — but an empty set is *unknown*, and unknown stops nothing.
 */
function stopFor(parts: WorldParts): { gameweekStop?: World['gameweekStop'] } {
  const covered = [...new Set(parts.projections.map((p) => p.gameweek))]
  const verdict = checkGameweek({
    gameweek: parts.gameweek.id,
    deadlineTime: parts.gameweek.deadlineTime,
    projectionsCover: covered,
    nowMs: parts.nowMs ?? Date.now(),
  })
  if (verdict.ok) return {}
  return {
    gameweekStop: {
      reason: verdict.reason,
      gameweek: verdict.gameweek,
      deadline: verdict.reason === 'deadline_passed' ? verdict.deadline : parts.gameweek.deadlineTime,
    },
  }
}
