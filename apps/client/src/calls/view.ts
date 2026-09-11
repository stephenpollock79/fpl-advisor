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
  type RowKey,
  TRANSFER_HORIZON_WEIGHTS,
  availabilityOf,
  callKey,
  evaluateCall,
  evaluationRows,
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
    }
  | {
      /** The swap is no better, or too little better to tell (the noise floor). */
      reading: 'no_change'
      net: number
      costTenths: number
      reasoning: string
      rows: EvaluationRow[]
      breakdown: Breakdown
    }

/** The figures exactly as the run stored them. */
export function storedFigures(call: WorldCall, out: WorldPlayer, into: WorldPlayer): CardFigures {
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
    rows: rowsFor(out, into),
    breakdown: call.breakdown,
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
export function recomputeTransfer(call: WorldCall, out: WorldPlayer, into: WorldPlayer): CardFigures | null {
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
  // Every value here is the engine's output or a published figure it was given.
  const breakdown: Breakdown = {
    weights: [...TRANSFER_HORIZON_WEIGHTS],
    out: { playerId: out.playerId, projections: out.projections, gate: outGate, total: outcome.incumbentTotal },
    in: { playerId: into.playerId, projections: into.projections, gate: inGate, total: outcome.challengerTotal },
    net: outcome.net,
    pointsHit: call.pointsHit,
    k: outcome.reading === 'call' ? outcome.k : call.k,
  }

  if (outcome.reading === 'no_change') {
    return {
      reading: 'no_change',
      net: outcome.net,
      costTenths: transferCostTenths(into.nowCostTenths, out.sellingPriceTenths),
      reasoning,
      rows,
      breakdown,
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
  }
}

/**
 * NBal (F3-AC-27): the Balance minus the cost of the selected calls. May go
 * negative, and is then shown negative — never blocked.
 */
export function nbal(bankTenths: number, inScope: { key: string; costTenths: number }[], decisions: Record<string, DecisionState>): number {
  return inScope.reduce((left, c) => (decisions[c.key] === 'selected' ? left - c.costTenths : left), bankTenths)
}

export const shortlistCount = (decisions: Record<string, DecisionState>): number =>
  Object.values(decisions).filter((s) => s === 'selected').length

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

/** How one evaluation row's value reads. Formatting only — every value is published or the engine's. */
export function formatRowValue(key: RowKey, value: number | null): string {
  if (value === null) return '—'
  switch (key) {
    case 'availability':
      return `${String(value)}%`
    case 'form':
    case 'xpts':
      return value.toFixed(1)
    case 'price':
      return formatMoney(value)
    case 'selected_by':
      return `${value.toFixed(1)}%`
    case 'transfers_in':
    case 'transfers_out':
      return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
    default:
      return String(value)
  }
}
