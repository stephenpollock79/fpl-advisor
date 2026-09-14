/**
 * What a call card shows, derived — never computed in a component.
 *
 * **Net, conviction and band come from exactly two places**: the run, which
 * stored the engine's figures, and `evaluateCall`, when a candidate is swapped on
 * a transfer card (F3-AC-24). Nothing here re-derives a band from a stored
 * conviction or a net from two projections — that is the disagreement between
 * surfaces ENGINE-AC-04 exists to stop, and a component that did it would pass
 * every engine test.
 *
 * Row winners and the fallback sentence are the engine's too (`evaluationRows`,
 * `templateReasoning`), so the card's highlights and its words are built from
 * the same comparison the server used.
 */

import {
  type Band,
  type CardPlayer,
  type EvaluationRow,
  type FplStatus,
  TRANSFER_HORIZON_WEIGHTS,
  availabilityOf,
  callKey,
  evaluateCall,
  evaluationRows,
  forecastCurrent,
  priceWatch,
  templateReasoning,
  transferCostTenths,
} from '@fpl/engine'
import type { Breakdown, DecisionState, World, WorldCall, WorldPlayer } from '../api'

export const playerIndex = (world: World): Map<number, WorldPlayer> =>
  new Map([...world.players, ...world.candidates].map((p) => [p.playerId, p]))

export const availabilityFor = (p: WorldPlayer) =>
  availabilityOf({ status: p.status as FplStatus, chanceOfPlayingNextRound: p.chanceOfPlayingNextRound })

/** The engine's key for a transfer — what a decision on a swapped card is filed against. */
export const transferKey = (outPlayerId: number, inPlayerId: number): string =>
  callKey({ type: 'transfer', outPlayerId, inPlayerId })

export function cardPlayer(p: WorldPlayer): CardPlayer {
  return {
    availability: availabilityFor(p),
    chanceOfPlayingNextRound: p.chanceOfPlayingNextRound,
    form: p.form,
    projection: p.projectedPoints,
    fixtures: p.fixtures.map((f) => ({ opponent: f.opponentShortName, isHome: f.isHome, difficulty: f.difficulty })),
    priceTenths: p.nowCostTenths,
    selectedByPercent: p.selectedByPercent,
    seasonPoints: p.seasonPoints,
    transfersIn: p.transfersIn,
    transfersOut: p.transfersOut,
  }
}

export const rowsFor = (out: WorldPlayer, into: WorldPlayer): EvaluationRow[] =>
  evaluationRows(cardPlayer(out), cardPlayer(into))

/** A player's price signal for WATCH, with FPL's lock read against the clock here. */
const priceSignalFor = (p: WorldPlayer) => ({
  name: p.surname,
  likelihoodTonight: p.priceLikelihoodTonight ?? null,
  locked: p.priceLockedUntil != null && Date.parse(p.priceLockedUntil) > Date.now(),
})

/**
 * Whether WATCH may still say "tonight" (F3-AC-17). A forecast read before FPL's
 * last overnight update is about a night that has passed.
 *
 * - `swapped`: a swap reads the players' figures, so it needs the latest read to be current.
 * - `stored`: a stored flag was set from the read its run made. It stands only
 *   while that read is the latest — a newer fetch means the run's is unknown, so
 *   the flag is hidden rather than trusted.
 */
export function watchFreshness(
  world: Pick<World, 'priceForecastReadAt' | 'lastRunAt'>,
  now: number = Date.now(),
): { stored: boolean; swapped: boolean } {
  if (world.priceForecastReadAt === null) return { stored: false, swapped: false }
  const readAt = Date.parse(world.priceForecastReadAt)
  const swapped = forecastCurrent(readAt, now)
  const stored = swapped && world.lastRunAt !== null && readAt <= Date.parse(world.lastRunAt)
  return { stored, swapped }
}

/** Everything the card's summary strip, table, breakdown and reasoning block show. */
export type CardFigures =
  | {
      reading: 'call'
      net: number
      conviction: number
      band: Band
      costTenths: number
      pointsHit: number
      k: number
      isForced: boolean
      reasoning: string
      rows: EvaluationRow[]
      breakdown: Breakdown
      /** Why WATCH is set, or null (STE-117). FORCED outranks it on screen. */
      watchReason: string | null
    }
  | {
      /**
       * Nothing to do. Either a swap the manager tried that is no better, or a
       * keep reading the run stored — an armband already on the right player
       * (F4-AC-02). Carries no conviction and no band by construction, so no
       * component can render a keep as a weak change.
       */
      reading: 'no_change'
      net: number
      costTenths: number
      /**
       * Why, in the manager's terms. The engine's own two, plus one the engine
       * cannot know: the captain call was rejected, so the vice armband stays
       * where it is rather than the pair being left inconsistent (F4-UP-02).
       */
      because: 'incumbent_wins' | 'below_floor' | 'captain_kept'
      k: number
      reasoning: string
      rows: EvaluationRow[]
      breakdown: Breakdown
      watchReason: string | null
    }

/** The figures exactly as the run stored them. */
export function storedFigures(call: WorldCall, out: WorldPlayer, into: WorldPlayer, watchCurrent: boolean): CardFigures {
  const rows = rowsFor(out, into)
  const watchReason = call.watch && watchCurrent ? call.watchReason : null

  // A keep reading the run stored (F4-AC-01). Its conviction and band are null
  // on the wire, and this is where that becomes a shape the card cannot misread
  // rather than two fields a component has to remember to check.
  if (call.isReading || call.conviction === null || call.band === null) {
    return {
      reading: 'no_change',
      net: call.net,
      costTenths: call.costTenths,
      because: call.readingReason ?? 'incumbent_wins',
      k: call.k,
      reasoning: call.reasoning,
      rows,
      breakdown: call.breakdown,
      watchReason,
    }
  }

  return {
    reading: 'call',
    net: call.net,
    conviction: call.conviction,
    band: call.band,
    costTenths: call.costTenths,
    pointsHit: call.pointsHit,
    k: call.k,
    isForced: call.isForced,
    reasoning: call.reasoning,
    rows,
    breakdown: call.breakdown,
    watchReason,
  }
}

/**
 * F3-AC-24 — a candidate is swapped on a transfer card, and every figure is
 * recomputed by the engine's one function: row winners, net, conviction, band,
 * cost, and the line (the template, since a swap makes no model call).
 *
 * Null where the swap cannot be scored honestly: an incoming player the gate
 * excludes, or an outgoing one whose selling price could not be recovered.
 */
export function recomputeTransfer(call: WorldCall, out: WorldPlayer, into: WorldPlayer, watchCurrent: boolean): CardFigures | null {
  const outGate = availabilityFor(out)
  const inGate = availabilityFor(into)
  if (!inGate.eligible || out.sellingPriceTenths === null) return null

  const outcome = evaluateCall({
    identity: { type: 'transfer', outPlayerId: out.playerId, inPlayerId: into.playerId },
    incumbent: { playerId: out.playerId, projections: out.projections, availability: outGate },
    challenger: { playerId: into.playerId, projections: into.projections, availability: inGate },
    pointsHit: call.pointsHit,
    money: { incomingPriceTenths: into.nowCostTenths, outgoingSellingPriceTenths: out.sellingPriceTenths },
  })

  const rows = rowsFor(out, into)
  const reasoning = templateReasoning(rows, out.surname, into.surname)
  // The swapped pair is its own transfer, so WATCH is read for it afresh.
  const watchReason = watchCurrent ? priceWatch(priceSignalFor(out), priceSignalFor(into)) : null
  // Every value here is the engine's output or a published figure it was given.
  const breakdown: Breakdown = {
    weights: [...TRANSFER_HORIZON_WEIGHTS],
    out: { playerId: out.playerId, projections: out.projections, gate: outGate, total: outcome.incumbentTotal },
    in: { playerId: into.playerId, projections: into.projections, gate: inGate, total: outcome.challengerTotal },
    net: outcome.net,
    pointsHit: call.pointsHit,
    k: outcome.reading === 'call' ? outcome.k : call.k,
    kLabel: call.breakdown.kLabel,
    byCeiling: call.breakdown.byCeiling,
  }

  if (outcome.reading === 'no_change') {
    return {
      reading: 'no_change',
      net: outcome.net,
      costTenths: transferCostTenths(into.nowCostTenths, out.sellingPriceTenths),
      because: outcome.reason,
      k: call.k,
      reasoning,
      rows,
      breakdown,
      watchReason,
    }
  }

  return {
    reading: 'call',
    net: outcome.net,
    conviction: outcome.conviction,
    band: outcome.band,
    costTenths: outcome.costTenths,
    pointsHit: outcome.pointsHit,
    k: outcome.k,
    isForced: outcome.isForced,
    reasoning,
    rows,
    breakdown,
    watchReason,
  }
}

/**
 * NBal (F3-AC-27): the Balance minus the cost of the selected calls. May go
 * negative, and is then shown negative — never blocked.
 */
export function nbal(bankTenths: number, inScope: { key: string; costTenths: number }[], decisions: Record<string, DecisionState>): number {
  return inScope.reduce((left, c) => (decisions[c.key] === 'selected' ? left - c.costTenths : left), bankTenths)
}

/**
 * The shortlist counts selected calls that are on screen (F3-AC-29) — the same
 * set NBal is computed over, so the two can never disagree about what is in it.
 */
export const shortlistCount = (keys: string[], decisions: Record<string, DecisionState>): number =>
  keys.filter((k) => decisions[k] === 'selected').length

/**
 * A decision on a swapped candidate is filed under the swapped pair's key, which
 * no stored call carries. Rebuild the swap from it, so the card that decision
 * belongs to is shown again after a reload rather than left orphaned. Keys come
 * from the engine's own function, so nothing here parses one.
 */
export function restoredSwaps(
  calls: WorldCall[],
  decisions: Record<string, DecisionState>,
): Record<string, { outId: number; inId: number }> {
  const swaps: Record<string, { outId: number; inId: number }> = {}
  for (const call of calls) {
    if (call.category !== 'transfer' || !call.alternatives || decisions[call.key] !== undefined) continue
    for (const outId of [call.outPlayerId, ...call.alternatives.out]) {
      for (const inId of [call.inPlayerId, ...call.alternatives.in]) {
        const key = transferKey(outId, inId)
        if (key !== call.key && decisions[key] !== undefined) swaps[call.key] = { outId, inId }
      }
    }
  }
  return swaps
}

/** Head to head shows only undecided calls, in the plan's order (F3-AC-13). */
export const undecided = (calls: WorldCall[], decisions: Record<string, DecisionState>): WorldCall[] =>
  calls.filter((c) => decisions[c.key] === undefined)

/** The line beneath Category cleared reports the live state (F3-AC-15). */
export function clearedLine(reopened: number): string {
  if (reopened === 0) return 'tap a decision to change it'
  if (reopened === 1) return '1 call reopened · tap again to put it back'
  return `${String(reopened)} calls reopened · tap again to put them back`
}

/** £ in millions, from tenths. A substitution's zero reads £0.00 (F3-AC-4, F3-AC-28). */
export function formatCost(tenths: number): string {
  if (tenths === 0) return '£0.00'
  const sign = tenths > 0 ? '−' : '+'
  return `${sign}£${(Math.abs(tenths) / 10).toFixed(1)}m`
}

export const formatMoney = (tenths: number): string =>
  `${tenths < 0 ? '−' : ''}£${(Math.abs(tenths) / 10).toFixed(1)}m`

export const formatNet = (net: number): string => `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(2)}`

/** How one evaluation row's value reads — the engine's, so the card and the reasoning prompt agree. */
export { formatRowValue } from '@fpl/engine'

/**
 * F4-UP-02 — the captain change is rejected, so the vice call becomes a keep
 * reading rather than disappearing.
 *
 * The vice call is generated on the assumption that the captain call is taken:
 * its challenger is chosen from players the recommended captain is not one of,
 * and where the vice is the one being promoted the armband is told to move. Turn
 * the captain call down and every one of those premises is gone, so the honest
 * answer is to stop advising on the vice rather than to leave the manager
 * holding a pair that contradicts itself.
 *
 * Nothing is recomputed here. The stored net, rows and breakdown are kept
 * exactly as the run produced them; only the shape of the answer changes.
 */
export function viceHeldByCaptain(figures: CardFigures, captainRejected: boolean): CardFigures {
  if (!captainRejected || figures.reading !== 'call') return figures
  return {
    reading: 'no_change',
    net: figures.net,
    costTenths: figures.costTenths,
    because: 'captain_kept',
    k: figures.k,
    reasoning: figures.reasoning,
    rows: figures.rows,
    breakdown: figures.breakdown,
    watchReason: figures.watchReason,
  }
}

/**
 * The sentences the model is never asked for (F4-AC-05, F4-AC-12).
 *
 * Both are facts about the call rather than judgements about the players, and
 * both use vocabulary the reasoning blocklist refuses — *penalties*, and the
 * probability words a vice premise reaches for. Writing them here keeps the
 * model's input exactly the card's own rows, and makes the wording testable
 * instead of graded.
 *
 * The tie-break sentence says that the tie-break decided it, and not which of
 * its two signals did. Only `chooseArmband` knows that, and claiming penalties
 * where position was what separated them would be inventing a reason.
 */
export function armbandNotes(call: WorldCall): string[] {
  const notes: string[] = []
  if (call.shape === 'vice') notes.push('The vice armband only pays if the captain does not play.')
  if (call.breakdown.byCeiling) {
    notes.push('Level on projected points, so the armband goes to the bigger ceiling.')
  }
  return notes
}

/** Why the app is not proposing a change, for the card's inert panel (F4-AC-02). */
export function readingLine(because: 'incumbent_wins' | 'below_floor' | 'captain_kept'): string {
  if (because === 'captain_kept') return 'Held while the captain stays as he is'
  if (because === 'below_floor') return 'Too close to call'
  return 'Already the stronger option'
}


export type DiffRow = { key: string; title: string; note: string }

/**
 * What the diff sheet says about each call a refresh touched (F6-AC-11).
 *
 * Only calls carrying a tag appear. A call that moved within its band, or did
 * not move at all, is deliberately absent — F6-AC-12 then has an empty list and
 * shows no sheet, because a report that says "nothing happened" teaches the
 * manager to dismiss it without reading, and the next one will matter.
 *
 * Nothing is computed here: the figures are the ones the run and the
 * recomputation already produced.
 */
export function diffRows(calls: readonly WorldCall[], nameOf: (id: number) => string): DiffRow[] {
  return calls.flatMap((call) => {
    const title = `${nameOf(call.outPlayerId)} → ${nameOf(call.inPlayerId)}`
    if (call.diffTag === 'band_move' && call.previousConviction !== null) {
      const now = call.isReading ? 'no change' : String(call.conviction ?? 0)
      return [{ key: call.key, title, note: `was ${String(call.previousConviction)}, now ${now}` }]
    }
    if (call.diffTag === 'returned') return [{ key: call.key, title, note: 'can no longer be made' }]
    if (call.diffTag === 'resurfaced') return [{ key: call.key, title, note: 'back, because what you rejected has changed' }]
    if (call.diffTag === 'new') return [{ key: call.key, title, note: 'new this run' }]
    if (call.diffTag === 'updated') return [{ key: call.key, title, note: 'rewritten this run' }]
    return []
  })
}
