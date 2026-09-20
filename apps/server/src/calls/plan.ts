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
  type ArmbandCandidate,
  type AvailabilityVerdict,
  type CallIdentity,
  type CallReading,
  type NoChangeReading,
  type Position,
  TRANSFER_HORIZON_WEIGHTS,
  benchOrder as orderBench,
  chooseArmband,
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
  /** His club's first-choice penalty taker. The ceiling tie-break's stronger signal (F4-AC-12). */
  takesPenalties: boolean
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
  isCaptain: boolean
  isVice: boolean
}

export type TransferProposal = { outPlayerId: number; inPlayerId: number }

export type PlanInput = {
  squad: SquadEntry[]
  pool: PlanPlayer[]
  bankTenths: number
  freeTransfers: number
  /** From the model. Absent, or none of them valid, and code picks. */
  proposals?: TransferProposal[]
  /**
   * Calls the manager has already selected (F6-AC-01). **Constraints, not
   * suggestions:** the cash and the free transfer are spent, the incoming player
   * is in the squad and the outgoing one is not, and neither can be touched
   * again. A run that re-planned around them would be offering to undo a
   * decision the manager has already made.
   */
  committed?: readonly CommittedCall[]
  /**
   * Keys the manager rejected, still standing (F6-AC-03). **A forced call
   * ignores this outright** (F6-AC-05) — if a starter has become unavailable
   * that call must surface, whatever was said about it earlier.
   */
  suppressed?: ReadonlySet<string>
}

export type CommittedCall = {
  key: string
  outPlayerId: number
  inPlayerId: number
  costTenths: number
  isTransfer: boolean
}

export type CallShape =
  | 'transfer'
  | 'forced_swap'
  | 'doubt_swap'
  | 'upgrade_swap'
  | 'bench_order'
  /**
   * One call carrying the whole ranking (STE-151). **`captain` and `vice`
   * remain** for rows written before 2026-09-20 — the shape is stored, so
   * removing them would make the week's own history unreadable — but nothing
   * produces them any more.
   */
  | 'armband'
  | 'captain'
  | 'vice'

/**
 * Shapes the planner can still read but will never write again.
 *
 * **A stored call in one of these cannot be reused, whatever the data says**
 * (2026-09-20). The reuse gate compares FPL's player records and each stored
 * call's own band — it is a check on whether the *world* moved, and it has no
 * idea the code that produces calls has changed underneath it. So the first
 * refresh after `armband` shipped found nothing moved, reused the week, and the
 * old two-card captaincy screen stayed put through every reload.
 *
 * Silence that means *I cannot see* rather than *nothing happened* is the same
 * failure the gate was rebuilt to remove, arriving from the other direction.
 *
 * **This is the narrow version.** The general one is a planner version stamped
 * on the run, so any change to how calls are produced invalidates a reuse
 * rather than only the changes someone remembered to list here — it needs a
 * column on `run`, and it is ticketed rather than smuggled in.
 */
export const RETIRED_SHAPES: ReadonlySet<CallShape> = new Set<CallShape>(['captain', 'vice'])

/**
 * One player's line in the armband table, in the order the card shows them.
 *
 * **Every squad member is here, pickable or not.** A high projection sitting on
 * the bench is the answer to "why isn't he captain?", and a table that hid him
 * would leave the question open — which is the whole reason this is a ranking
 * rather than a swap.
 */
export type ArmbandRow = {
  playerId: number
  projection: number
  /** Why he cannot take the armband. Null where he can. */
  because: string | null
  isCaptainPick: boolean
  isVicePick: boolean
  /** The ceiling tie-break chose him over the plain highest projection (F4-AC-12). */
  byCeiling: boolean
}

type PlannedBase = {
  key: string
  category: 'transfer' | 'substitution' | 'captaincy'
  shape: CallShape
  outPlayerId: number
  inPlayerId: number
  identity: CallIdentity
  /**
   * The captaincy ceiling tie-break chose this challenger over the plain highest
   * projection (F4-AC-12). Carried from `chooseArmband`, which is the only thing
   * that knows it — the engine's call outcome does not. Absent on every other
   * call, because the tie-break is captain and vice only.
   */
  byCeiling?: boolean
  /**
   * The ranking behind an armband call — the table the card renders (STE-151).
   * Absent on every other call, because nothing else is a ranking.
   */
  armband?: { rows: readonly ArmbandRow[]; captainId: number; viceId: number }
}

/** A call the manager can act on. Everything transfers and substitutions produce. */
export type DecidableCall = PlannedBase & {
  outcome: CallReading
  /** The picker's curated lists, transfers only: three out, five in (F3-AC-23). */
  alternatives?: { out: number[]; in: number[] }
}

/**
 * A keep reading: the app has an answer and the answer is *nothing to do*.
 *
 * Only captaincy produces one, and it must (F4-AC-01) — advice on both armbands
 * every week, including the weeks the holder is already right. A transfer or a
 * substitution with nothing to say is simply not offered; an armband cannot be
 * silent, because the manager holds one whether or not he changes it.
 */
export type ReadingCall = PlannedBase & { outcome: NoChangeReading }

export type PlannedCall = DecidableCall | ReadingCall

/**
 * A call rather than a reading.
 *
 * The discriminant sits one level down, on the engine's own outcome, and
 * TypeScript does not narrow a union through a nested property on its own. This
 * is that narrowing, written once, so no consumer reaches for a conviction a
 * reading does not have.
 */
export const isDecidable = (call: PlannedCall): call is DecidableCall => call.outcome.reading === 'call'

/** FPL charges four points for each transfer beyond the free allowance. */
const POINTS_HIT = 4
/** FPL allows three players from one club. */
const MAX_PER_CLUB = 3
const PICKER_OUT = 3
const PICKER_IN = 5

/** Forced first, then the strongest, then the key — so the same inputs always give the same plan. */
const rank = (a: DecidableCall, b: DecidableCall): number => {
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
): DecidableCall | null =>
  outcome.reading === 'call'
    ? { key: outcome.key, category, shape, outPlayerId, inPlayerId, identity, outcome }
    : null

/**
 * The same fields either way. The branch exists so the outcome's own tag picks
 * the arm of the union, which is what keeps a reading from ever being read as a
 * call with a missing conviction.
 */
const planned = (base: PlannedBase, outcome: ReturnType<typeof evaluateCall>): PlannedCall =>
  outcome.reading === 'call' ? { ...base, outcome } : { ...base, outcome }

export function planWeek(raw: PlanInput): PlannedCall[] {
  const input = withCommitments(raw)
  const suppressedKeys = raw.suppressed ?? new Set<string>()
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

  // Every player a selected call holds is claimed before the search starts, so
  // nothing the plan produces can contradict a decision already made.
  const touched = new Set<number>((raw.committed ?? []).flatMap((c) => [c.outPlayerId, c.inPlayerId]))
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

  const evaluateTransfer = (out: SquadEntry, into: PlanPlayer): DecidableCall | null => {
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

  const transferCandidates = (): DecidableCall[] => {
    if (proposals.length > 0) {
      return proposals
        .map((p) => {
          const out = squadById.get(p.outPlayerId)
          const into = poolById.get(p.inPlayerId)
          return out && into && transferFeasible(out, into) ? evaluateTransfer(out, into) : null
        })
        .filter((c): c is DecidableCall => c !== null)
    }

    const best: DecidableCall[] = []
    for (const out of input.squad) {
      if (touched.has(out.playerId)) continue
      let top: DecidableCall | null = null
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

  const substitutionCandidates = (): DecidableCall[] =>
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
      .filter((c): c is DecidableCall => c !== null)

  /**
   * One bench-order call at most: the first outfield slot holding the wrong
   * player. Only players who stay on the bench are ordered — one the best eleven
   * brings in is a substitution's business, not a bench slot's.
   */
  const benchCandidate = (): DecidableCall[] => {
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

  /**
   * **The armband is one decision, not two swaps** (STE-151, ruled 2026-09-20).
   *
   * It was two calls — captain and vice — each a head-to-head between a holder
   * and a challenger. The engine never worked that way: `chooseArmband` ranks
   * the eligible starters and takes the top two. Everything downstream then
   * translated that ranking back into a pair of swaps, and **the translation is
   * where it went wrong every time**: five editorials describing the armbands
   * wrongly, a vice call scoring above its own captain call and sorting above it,
   * and a conviction figure on the vice that read as points banked when it is
   * collectable only in a week the captain does not play.
   *
   * So the ranking is now the thing that is carried, and the card renders it.
   * **The pick cannot be misdescribed if the pick is a sorted list.**
   *
   * Built after the greedy loop, because transfers and substitutions claim a
   * contested player first (ruled 2026-09-14) — a transfer spends a scarce,
   * multi-week resource, while the armband is free and re-taken every week, so
   * the free decision must not block the scarce one. **Only the challenger side
   * is subject to that claim:** if the captain is being sold the armband has to
   * move, and refusing to say so would leave the manager with advice that
   * contradicts itself.
   */
  const armbandCalls = (): PlannedCall[] => {
    const captain = input.squad.find((p) => p.isCaptain)
    const vice = input.squad.find((p) => p.isVice)
    if (!captain || !vice) return []

    /**
     * **The pool is the whole fifteen, not the starting eleven** (ruled
     * 2026-09-20, after the first live run).
     *
     * It was the starters minus anyone another call had claimed — and on the
     * first week that shipped, the two highest projections in the squad were
     * Groß on 11.0 and De Cuyper on 8.8, both barred for being on the bench,
     * both the subject of substitutions the manager had not accepted yet. The
     * table ruled out its own best answers on a condition the manager was one
     * tap from changing.
     *
     * **Only the side that is leaving is excluded**, which is the part of the
     * old rule worth keeping: a player being transferred out, or coming out of
     * the eleven, cannot be the man you hand the armband to. A player arriving
     * can.
     *
     * The honest limit: a bench player nobody is bringing on is now a candidate,
     * and captaining him would be poor advice. That is the interconnected
     * -decisions problem (STE-162) showing through, and this is the best answer
     * available before it is solved properly — a ranking that shows the real top
     * of the squad beats one that hides it behind a decision not yet made.
     */
    const leaving = new Set(chosen.map((c) => c.outPlayerId))

    const candidates: ArmbandCandidate[] = input.squad
      .filter((p) => !leaving.has(p.playerId))
      .map((p) => ({
        playerId: p.playerId,
        projection: thisWeek(p),
        availability: p.availability,
        takesPenalties: p.takesPenalties,
        position: p.position,
      }))

    const eligible = candidates.filter((c) => c.availability.eligible)
    // `chooseArmband` throws below two, and a thin squad must not cost the week
    // its transfer advice as well as its captaincy advice.
    if (eligible.length < 2) return []

    const armband = chooseArmband(candidates)

    /**
     * **Why a player cannot take the armband, in the order the manager would
     * ask it.** Every row of the table is shown, including the ones that cannot
     * be picked — a high projection sitting on the bench is the answer to "why
     * isn't he captain?", and hiding it leaves the question open.
     */
    const barredBecause = (p: SquadEntry): string | null => {
      if (!p.availability.eligible) return p.availability.reason ?? 'unavailable'
      if (!p.hasFixture) return 'no fixture this gameweek'
      if (leaving.has(p.playerId)) return 'coming out of the side this week'
      // **Being on the bench is not a bar**, and is not stated here. It is on
      // the row already, and the table shows it as context rather than as a
      // reason he cannot be picked.
      return null
    }

    const rows: ArmbandRow[] = [...input.squad]
      .map((p) => ({
        playerId: p.playerId,
        projection: thisWeek(p),
        because: barredBecause(p),
        isCaptainPick: p.playerId === armband.captainId,
        isVicePick: p.playerId === armband.viceId,
        byCeiling:
          (p.playerId === armband.captainId && armband.captainByCeiling) ||
          (p.playerId === armband.viceId && armband.viceByCeiling),
      }))
      // Highest first, then by id so the same squad always sorts the same way.
      .sort((a, b) => b.projection - a.projection || a.playerId - b.playerId)

    /**
     * **The figure is the captain's, because the captain is what doubles.**
     *
     * Moving the armband from A to B is worth exactly `B - A`, once: the week
     * scores `2B + A` instead of `2A + B`, and the doubling cancels. So the
     * plain difference the engine already computes is the true gain, and no new
     * arithmetic is needed.
     *
     * **Where the captain does not move but the vice does, the figure is the
     * vice's** — there is still something to do, and a call reading +0.00 over a
     * real change would say the opposite. The two are never added: you collect
     * one or the other, never both, and summing them would assert an equivalence
     * that F4-AC-10 exists to deny.
     */
    const pair =
      armband.captainId !== captain.playerId
        ? { holder: captain, pickId: armband.captainId, role: 'captain' as const }
        : armband.viceId !== vice.playerId
          ? { holder: vice, pickId: armband.viceId, role: 'vice' as const }
          : { holder: captain, pickId: armband.captainId, role: 'captain' as const }

    const challenger = squadById.get(pair.pickId)
    if (!challenger) return []

    const identity: CallIdentity =
      pair.role === 'captain'
        ? { type: 'captain', fromPlayerId: pair.holder.playerId, toPlayerId: challenger.playerId }
        : { type: 'vice', fromPlayerId: pair.holder.playerId, toPlayerId: challenger.playerId }

    const outcome = evaluateCall({
      identity,
      incumbent: side(pair.holder, 1),
      challenger: side(challenger, 1),
      /**
       * **Forced when, and only when, the holder cannot score this gameweek** —
       * the gate, or no fixture (F4-AC-07). The same predicate the substitution
       * search uses. It needs no special figure: a holder who cannot play
       * projects zero, so the gap to the best available is the whole of it and
       * the conviction follows on its own.
       */
      incumbentUnplayable: !pair.holder.hasFixture,
    })

    return [
      planned(
        {
          key: outcome.key,
          category: 'captaincy',
          shape: 'armband',
          outPlayerId: pair.holder.playerId,
          inPlayerId: challenger.playerId,
          identity,
          byCeiling: pair.role === 'captain' ? armband.captainByCeiling : armband.viceByCeiling,
          armband: { rows, captainId: armband.captainId, viceId: armband.viceId },
        },
        outcome,
      ),
    ]
  }

  const chosen: DecidableCall[] = []
  for (;;) {
    const [pick] = [...substitutionCandidates(), ...benchCandidate(), ...transferCandidates()]
      // F6-AC-03 and F6-AC-05, in that order and never merged: a rejection holds,
      // and a forced call walks through it. Merging the two would lose the
      // exception the first time both were true, which is exactly the week it
      // matters — a starter the manager already said no to, now injured.
      .filter((c) => !suppressedKeys.has(c.key) || c.outcome.isForced)
      .sort(rank)
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

  return [...transfers, ...subs, ...armbandCalls()]
}

/**
 * The curated lists a transfer card's picker offers (F3-AC-23): the three
 * weakest other squad players in the same position, and the five strongest
 * affordable, eligible pool players who would keep the squad legal — excluding
 * anyone another call already holds.
 */
function pickerLists(
  call: DecidableCall,
  input: PlanInput,
  pool: PlanPlayer[],
  chosen: DecidableCall[],
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


/**
 * The squad as the manager's own decisions have already left it (F6-AC-01).
 *
 * A selected transfer is not a proposal any more: its money is gone, its free
 * transfer is used, the player he is buying is his and the player he is selling
 * is not. Planning against the squad he started the week with would offer him
 * advice that quietly assumes he changes his mind.
 *
 * A selected substitution or captaincy call moves no money and no player between
 * squad and pool, so it constrains by holding its players and nothing else.
 */
function withCommitments(input: PlanInput): PlanInput {
  const committed = input.committed ?? []
  if (committed.length === 0) return input

  const transfers = committed.filter((c) => c.isTransfer)
  if (transfers.length === 0) return input

  const leaving = new Set(transfers.map((c) => c.outPlayerId))
  const arriving = new Map(transfers.map((c) => [c.inPlayerId, c]))
  const poolById = new Map(input.pool.map((p) => [p.playerId, p]))

  const incoming: SquadEntry[] = []
  for (const [id] of arriving) {
    const player = poolById.get(id)
    // A committed player the latest read no longer carries is not silently
    // dropped from the squad — the run simply cannot place him, and the call
    // that named him is reported unexecutable by the recomputation instead.
    if (player) incoming.push({ ...player, isStarter: true, benchOrder: null, sellingPriceTenths: player.nowCostTenths, isCaptain: false, isVice: false })
  }

  return {
    ...input,
    squad: [...input.squad.filter((p) => !leaving.has(p.playerId)), ...incoming],
    pool: input.pool.filter((p) => !arriving.has(p.playerId)),
    bankTenths: input.bankTenths - transfers.reduce((sum, c) => sum + c.costTenths, 0),
    freeTransfers: Math.max(0, input.freeTransfers - transfers.length),
  }
}
