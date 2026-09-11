/**
 * One run of the week's transfer and substitution calls — the four pipeline
 * steps, in the criteria's order (ENGINE, *Who does what*):
 *
 *   1. the model proposes transfers, from a shortlist code built;
 *   2. code computes — `planWeek`, which puts every pair to `evaluateCall`;
 *   3. the model writes each card's line from that card's table alone;
 *   4. code decides what is shown — the line is checked, and the template
 *      stands in wherever it fails.
 *
 * Pure given its model: world in, stored calls and a record of every model call
 * out. The database reads and writes happen at the route.
 */

import {
  type AvailabilityVerdict,
  type Band,
  type CardPlayer,
  TRANSFER_HORIZON_WEIGHTS,
  evaluationRows,
  horizonTotal,
  horizonWeightsFor,
} from '@fpl/engine'
import { type PlanInput, type PlanPlayer, type PlannedCall, planWeek } from '../calls/plan.js'
import type { ModelCallRecord, ModelPort, ShortPlayer } from '../model/client.js'
import { finalReasoning } from '../model/reasoning.js'

/** What the card shows for one player, plus the names the reasoning and the shortlist use. */
export type CardInfo = CardPlayer & { name: string; club: string; status: string }

export type BreakdownSide = {
  playerId: number
  /** Exactly the figures put to the engine, as the feed publishes them. */
  projections: number[]
  /** The availability gate's verdict, and its reason where it excluded. */
  gate: AvailabilityVerdict
  /** The engine's weighted total. Not recomputed here or anywhere downstream. */
  total: number
}

/** Every value the *How this was calculated* panel shows (F3-AC-30, F3-AC-31). */
export type Breakdown = {
  weights: number[]
  out: BreakdownSide
  in: BreakdownSide
  net: number
  pointsHit: number
  k: number
}

export type StoredCall = {
  key: string
  category: PlannedCall['category']
  shape: PlannedCall['shape']
  outPlayerId: number
  inPlayerId: number
  net: number
  conviction: number
  band: Band
  k: number
  pointsHit: number
  costTenths: number
  isForced: boolean
  /** Nothing sets it: neither trigger has a data source (STE-117). */
  watch: false
  reasoning: string
  reasoningSource: 'model' | 'template'
  breakdown: Breakdown
  alternatives: { out: number[]; in: number[] } | null
  position: number
}

/** How many candidates per outgoing player the proposal call is shown. */
const SHORTLIST_PER_OUT = 5

export async function generateWeek(input: {
  plan: PlanInput
  cards: Map<number, CardInfo>
  model: ModelPort
}): Promise<{ calls: StoredCall[]; modelCalls: ModelCallRecord[] }> {
  const card = (id: number): CardInfo => {
    const found = input.cards.get(id)
    if (!found) throw new Error(`No card data for player ${String(id)}. Refusing to describe a player the world does not hold.`)
    return found
  }

  // Step 1 — the model proposes, from named fields only (ADR 0009).
  const proposal = await input.model.proposeTransfers(shortlistFor(input.plan, card))

  // Step 2 — code computes.
  const planned = planWeek({ ...input.plan, proposals: proposal.proposals })

  // Step 3 — one line per card, from that card's table alone. Step 4 — checked.
  const lines = await Promise.all(
    planned.map(async (call) => {
      const out = card(call.outPlayerId)
      const into = card(call.inPlayerId)
      const rows = evaluationRows(out, into)
      const written = await input.model.writeReasoning({
        outName: out.name,
        inName: into.name,
        rows,
        summary: { net: call.outcome.net, strength: call.outcome.conviction, band: call.outcome.band },
      })
      return { ...finalReasoning(written.text, rows, out.name, into.name), record: written.record }
    }),
  )

  const players = new Map<number, PlanPlayer>([...input.plan.squad, ...input.plan.pool].map((p) => [p.playerId, p]))

  const calls = planned.map((call, position): StoredCall => {
    const weights = [...horizonWeightsFor(call.outcome.type)]
    const projectionsOf = (id: number): number[] => {
      const p = players.get(id)
      if (!p) return []
      return weights.length === 1 ? [p.hasFixture ? (p.projections[0] ?? 0) : 0] : p.projections.slice(0, weights.length)
    }
    const line = lines[position]

    return {
      key: call.key,
      category: call.category,
      shape: call.shape,
      outPlayerId: call.outPlayerId,
      inPlayerId: call.inPlayerId,
      net: call.outcome.net,
      conviction: call.outcome.conviction,
      band: call.outcome.band,
      k: call.outcome.k,
      pointsHit: call.outcome.pointsHit,
      costTenths: call.outcome.costTenths,
      isForced: call.outcome.isForced,
      watch: false,
      reasoning: line?.text ?? '',
      reasoningSource: line?.source ?? 'template',
      breakdown: {
        weights,
        out: {
          playerId: call.outPlayerId,
          projections: projectionsOf(call.outPlayerId),
          gate: players.get(call.outPlayerId)?.availability ?? { eligible: true },
          total: call.outcome.incumbentTotal,
        },
        in: {
          playerId: call.inPlayerId,
          projections: projectionsOf(call.inPlayerId),
          gate: players.get(call.inPlayerId)?.availability ?? { eligible: true },
          total: call.outcome.challengerTotal,
        },
        net: call.outcome.net,
        pointsHit: call.outcome.pointsHit,
        k: call.outcome.k,
      },
      alternatives: call.alternatives ?? null,
      position,
    }
  })

  return { calls, modelCalls: [proposal.record, ...lines.map((l) => l.record)] }
}

/**
 * What the proposal call is shown: the squad, and for each player the few
 * strongest eligible, affordable replacements in his position. Named fields —
 * never a feed response passed through.
 */
function shortlistFor(plan: PlanInput, card: (id: number) => CardInfo) {
  const horizon = (p: PlanPlayer) =>
    horizonTotal(p.projections.slice(0, TRANSFER_HORIZON_WEIGHTS.length), TRANSFER_HORIZON_WEIGHTS)

  const short = (p: PlanPlayer): ShortPlayer => {
    const c = card(p.playerId)
    return {
      id: p.playerId,
      name: c.name,
      position: p.position,
      club: c.club,
      priceTenths: p.nowCostTenths,
      projections: p.projections.slice(0, TRANSFER_HORIZON_WEIGHTS.length),
      status: c.status,
      chanceOfPlaying: c.chanceOfPlayingNextRound,
    }
  }

  return {
    bankTenths: plan.bankTenths,
    freeTransfers: plan.freeTransfers,
    squad: plan.squad.map(short),
    shortlist: plan.squad
      .map((out) => ({
        outPlayerId: out.playerId,
        candidates: plan.pool
          .filter(
            (p) =>
              out.sellingPriceTenths !== null &&
              p.position === out.position &&
              p.availability.eligible &&
              p.nowCostTenths - out.sellingPriceTenths <= plan.bankTenths,
          )
          .sort((a, b) => horizon(b) - horizon(a) || a.playerId - b.playerId)
          .slice(0, SHORTLIST_PER_OUT)
          .map(short),
      }))
      .filter((s) => s.candidates.length > 0),
  }
}
