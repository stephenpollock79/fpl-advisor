/**
 * The week's transfer and substitution calls, generated as one plan
 * (F3-UP-04).
 *
 * Two calls may never touch the same player, and that is prevented here rather
 * than detected on screen. GW4 made it real in week one: Tzolis was wanted by a
 * substitution and by the best transfer available. So calls are chosen one at a
 * time — forced first, then the strongest — and every remaining candidate is
 * searched again without the players already held.
 *
 * **Nothing here scores a call.** Every figure comes from `evaluateCall`, the
 * engine's one function (ENGINE-AC-04). This file decides which pairs are put to
 * it and which of its answers make the plan.
 *
 * Pure: squad, pool and bank in; calls out. The model's transfer proposals are an
 * input like any other, and are checked before they are used — never trusted.
 */

import {
  type AvailabilityVerdict,
  type CallIdentity,
  type CallReading,
  type Position,
  TRANSFER_HORIZON_WEIGHTS,
  benchOrder as orderBench,
  evaluateCall,
  horizonTotal,
} from '@fpl/engine'
import { type SquadMember, bestEleven, substitutions } from './legal-xi.js'

export type PlanPlayer = {
  playerId: number
  position: Position
  clubId: number
  /** The feed's projection for this gameweek and the two after, zero where the club blanks. */
  projections: readonly number[]
  availability: AvailabilityVerdict
  flagged: boolean
  /** This gameweek, from the fixture table. */
  hasFixture: boolean
  nowCostTenths: number
}

export type SquadEntry = PlanPlayer & {
  isStarter: boolean
  benchOrder: 0 | 1 | 2 | 3 | null
  /**
   * FPL's selling price, from the engine's `sellingPriceTenths` (F3-AC-25).
   * Null where the purchase price could not be recovered — and then he is not
   * offered for sale, rather than sold at a guessed price.
   */
  sellingPriceTenths: number | null
}

export type TransferProposal = { outPlayerId: number; inPlayerId: number }

export type PlanInput = {
  squad: SquadEntry[]
  pool: PlanPlayer[]
  bankTenths: number
  freeTransfers: number
  /** From the model. Absent, or none of them valid, and code picks. */
  proposals?: TransferProposal[]
}

export type CallShape = 'transfer' | 'forced_swap' | 'doubt_swap' | 'upgrade_swap' | 'bench_order'

export type PlannedCall = {
  key: string
  category: 'transfer' | 'substitution'
  shape: CallShape
  outPlayerId: number
  inPlayerId: number
  identity: CallIdentity
  outcome: CallReading
  /** The picker's curated lists, transfers only: three out, five in (F3-AC-23). */
  alternatives?: { out: number[]; in: number[] }
}

/** FPL charges four points for each transfer beyond the free allowance. */
const POINTS_HIT = 4
/** FPL allows three players from one club. */
const MAX_PER_CLUB = 3
const PICKER_OUT = 3
const PICKER_IN = 5

/** Forced first, then the strongest, then the key — so the same inputs always give the same plan. */
const rank = (a: PlannedCall, b: PlannedCall): number => {
  if (a.outcome.isForced !== b.outcome.isForced) return a.outcome.isForced ? -1 : 1
  if (a.outcome.conviction !== b.outcome.conviction) return b.outcome.conviction - a.outcome.conviction
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

const thisWeek = (p: PlanPlayer): number => (p.hasFixture ? (p.projections[0] ?? 0) : 0)

const side = (p: PlanPlayer, weeks: number) => ({
  playerId: p.playerId,
  projections: weeks === 1 ? [thisWeek(p)] : p.projections.slice(0, weeks),
  availability: p.availability,
})

const asCall = (
  identity: CallIdentity,
  category: PlannedCall['category'],
  shape: CallShape,
  outPlayerId: number,
  inPlayerId: number,
  outcome: ReturnType<typeof evaluateCall>,
): PlannedCall | null =>
  outcome.reading === 'call'
    ? { key: outcome.key, category, shape, outPlayerId, inPlayerId, identity, outcome }
    : null

export function planWeek(input: PlanInput): PlannedCall[] {
  const squadIds = new Set(input.squad.map((p) => p.playerId))
  const pool = input.pool.filter((p) => !squadIds.has(p.playerId))
  const squadById = new Map(input.squad.map((p) => [p.playerId, p]))
  const poolById = new Map(pool.map((p) => [p.playerId, p]))

  const members: SquadMember[] = input.squad.map((p) => ({
    playerId: p.playerId,
    position: p.position,
    projection: thisWeek(p),
    isStarter: p.isStarter,
    benchOrder: p.benchOrder,
    availability: p.availability,
    flagged: p.flagged,
    hasFixture: p.hasFixture,
  }))
  const inBestEleven = new Set(bestEleven(members).map((m) => m.playerId))
  const allSubstitutions = substitutions(members)

  const touched = new Set<number>()
  const clubCount = new Map<number, number>()
  for (const p of input.squad) clubCount.set(p.clubId, (clubCount.get(p.clubId) ?? 0) + 1)
  let bank = input.bankTenths
  let transfersTaken = 0

  const transferFeasible = (out: SquadEntry | undefined, into: PlanPlayer | undefined): boolean => {
    if (!out || !into || touched.has(out.playerId) || touched.has(into.playerId)) return false
    if (out.sellingPriceTenths === null) return false
    if (out.position !== into.position || !into.availability.eligible) return false
    // Affordable against what the plan has already spent — so a later transfer
    // cannot be proposed on money an earlier one used.
    if (into.nowCostTenths - out.sellingPriceTenths > bank) return false
    const clubAfter = (clubCount.get(into.clubId) ?? 0) + (out.clubId === into.clubId ? 0 : 1)
    return clubAfter <= MAX_PER_CLUB
  }

  const evaluateTransfer = (out: SquadEntry, into: PlanPlayer): PlannedCall | null => {
    const identity: CallIdentity = { type: 'transfer', outPlayerId: out.playerId, inPlayerId: into.playerId }
    return asCall(
      identity,
      'transfer',
      'transfer',
      out.playerId,
      into.playerId,
      evaluateCall({
        identity,
        incumbent: side(out, TRANSFER_HORIZON_WEIGHTS.length),
        challenger: side(into, TRANSFER_HORIZON_WEIGHTS.length),
        pointsHit: transfersTaken >= input.freeTransfers ? POINTS_HIT : 0,
        // Feasibility has already refused an unknown selling price.
        money: { incomingPriceTenths: into.nowCostTenths, outgoingSellingPriceTenths: out.sellingPriceTenths ?? 0 },
      }),
    )
  }

  // Checked once, against the squad as it stands. **Usable means the engine
  // scores it as a call** — feasible is not enough. If the model proposed anything
  // usable, those are the transfers on offer; if it proposed nothing usable, code
  // picks, and the plan is the same as it would have been with no model at all.
  //
  // Feasible-but-losing proposals once counted as usable: on the second live run
  // (2026-09-11) the model proposed transfers the engine scored as no better, and
  // they suppressed a +4.93 transfer code had found, leaving the week with none.
  const proposals = (input.proposals ?? []).filter((p) => {
    const out = squadById.get(p.outPlayerId)
    const into = poolById.get(p.inPlayerId)
    return out !== undefined && into !== undefined && transferFeasible(out, into) && evaluateTransfer(out, into) !== null
  })

  const transferCandidates = (): PlannedCall[] => {
    if (proposals.length > 0) {
      return proposals
        .map((p) => {
          const out = squadById.get(p.outPlayerId)
          const into = poolById.get(p.inPlayerId)
          return out && into && transferFeasible(out, into) ? evaluateTransfer(out, into) : null
        })
        .filter((c): c is PlannedCall => c !== null)
    }

    const best: PlannedCall[] = []
    for (const out of input.squad) {
      if (touched.has(out.playerId)) continue
      let top: PlannedCall | null = null
      for (const into of pool) {
        if (!transferFeasible(out, into)) continue
        const call = evaluateTransfer(out, into)
        if (!call) continue
        if (!top || call.outcome.net > top.outcome.net || (call.outcome.net === top.outcome.net && call.inPlayerId < top.inPlayerId)) {
          top = call
        }
      }
      if (top) best.push(top)
    }
    return best
  }

  const substitutionCandidates = (): PlannedCall[] =>
    allSubstitutions
      .filter((s) => !touched.has(s.outPlayerId) && !touched.has(s.inPlayerId))
      .map((s) => {
        const out = squadById.get(s.outPlayerId)
        const into = squadById.get(s.inPlayerId)
        if (!out || !into || !into.availability.eligible || !into.hasFixture) return null
        const identity: CallIdentity = {
          type: 'substitution',
          variant: s.variant,
          outPlayerId: s.outPlayerId,
          inPlayerId: s.inPlayerId,
        }
        return asCall(
          identity,
          'substitution',
          `${s.variant}_swap`,
          s.outPlayerId,
          s.inPlayerId,
          evaluateCall({
            identity,
            incumbent: side(out, 1),
            challenger: side(into, 1),
            incumbentUnplayable: !out.hasFixture,
          }),
        )
      })
      .filter((c): c is PlannedCall => c !== null)

  /**
   * One bench-order call at most: the first outfield slot holding the wrong
   * player. Only players who stay on the bench are ordered — one the best eleven
   * brings in is a substitution's business, not a bench slot's.
   */
  const benchCandidate = (): PlannedCall[] => {
    const bench = input.squad
      .filter((p) => !p.isStarter && (p.benchOrder ?? 0) >= 1 && !inBestEleven.has(p.playerId) && !touched.has(p.playerId))
      .sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0))
    const recommended = orderBench(
      bench.map((p) => ({ playerId: p.playerId, projection: thisWeek(p), availability: p.availability })),
    )

    const slot = bench.findIndex((p, i) => p.playerId !== recommended[i]?.playerId)
    if (slot < 0) return []
    const incumbent = bench[slot]
    const challenger = squadById.get(recommended[slot]?.playerId ?? -1)
    if (!incumbent || !challenger || !challenger.availability.eligible) return []

    const identity: CallIdentity = {
      type: 'bench_order',
      slotA: incumbent.benchOrder ?? 0,
      slotB: challenger.benchOrder ?? 0,
    }
    const call = asCall(
      identity,
      'substitution',
      'bench_order',
      incumbent.playerId,
      challenger.playerId,
      evaluateCall({ identity, incumbent: side(incumbent, 1), challenger: side(challenger, 1) }),
    )
    return call ? [call] : []
  }

  const chosen: PlannedCall[] = []
  for (;;) {
    const [pick] = [...substitutionCandidates(), ...benchCandidate(), ...transferCandidates()].sort(rank)
    if (!pick) break

    chosen.push(pick)
    touched.add(pick.outPlayerId)
    touched.add(pick.inPlayerId)

    if (pick.category === 'transfer') {
      const out = squadById.get(pick.outPlayerId)
      const into = poolById.get(pick.inPlayerId)
      bank -= pick.outcome.costTenths
      transfersTaken += 1
      if (out && into && out.clubId !== into.clubId) {
        clubCount.set(out.clubId, (clubCount.get(out.clubId) ?? 1) - 1)
        clubCount.set(into.clubId, (clubCount.get(into.clubId) ?? 0) + 1)
      }
    }
  }

  const withAlternatives = chosen.map((call) =>
    call.category === 'transfer' ? { ...call, alternatives: pickerLists(call, input, pool, chosen) } : call,
  )

  // Transfers, then substitutions. In a blank week the bench-order call leads the
  // substitutions: an auto-substitution is the only cover a blanking starter has
  // (F3-AC-06).
  const blankWeek = input.squad.some((p) => p.isStarter && !p.hasFixture)
  const transfers = withAlternatives.filter((c) => c.category === 'transfer').sort(rank)
  const subs = withAlternatives
    .filter((c) => c.category === 'substitution')
    .sort((a, b) => {
      if (blankWeek && (a.shape === 'bench_order') !== (b.shape === 'bench_order')) {
        return a.shape === 'bench_order' ? -1 : 1
      }
      return rank(a, b)
    })

  return [...transfers, ...subs]
}

/**
 * The curated lists a transfer card's picker offers (F3-AC-23): the three
 * weakest other squad players in the same position, and the five strongest
 * affordable, eligible pool players who would keep the squad legal — excluding
 * anyone another call already holds.
 */
function pickerLists(
  call: PlannedCall,
  input: PlanInput,
  pool: PlanPlayer[],
  chosen: PlannedCall[],
): { out: number[]; in: number[] } {
  const held = new Set(chosen.filter((c) => c !== call).flatMap((c) => [c.outPlayerId, c.inPlayerId]))
  const out = input.squad.find((p) => p.playerId === call.outPlayerId)
  if (!out || out.sellingPriceTenths === null) return { out: [], in: [] }
  const selling = out.sellingPriceTenths

  const horizon = (p: PlanPlayer) => horizonTotal(p.projections.slice(0, TRANSFER_HORIZON_WEIGHTS.length), TRANSFER_HORIZON_WEIGHTS)

  const outs = input.squad
    .filter((p) => p.position === out.position && p.playerId !== out.playerId && !held.has(p.playerId))
    .sort((a, b) => horizon(a) - horizon(b) || a.playerId - b.playerId)
    .slice(0, PICKER_OUT)
    .map((p) => p.playerId)

  const clubs = new Map<number, number>()
  for (const p of input.squad) clubs.set(p.clubId, (clubs.get(p.clubId) ?? 0) + 1)

  const ins = pool
    .filter(
      (p) =>
        p.position === out.position &&
        p.playerId !== call.inPlayerId &&
        !held.has(p.playerId) &&
        p.availability.eligible &&
        p.nowCostTenths - selling <= input.bankTenths &&
        (clubs.get(p.clubId) ?? 0) + (p.clubId === out.clubId ? 0 : 1) <= MAX_PER_CLUB,
    )
    .sort((a, b) => horizon(b) - horizon(a) || a.playerId - b.playerId)
    .slice(0, PICKER_IN)
    .map((p) => p.playerId)

  return { out: outs, in: ins }
}
