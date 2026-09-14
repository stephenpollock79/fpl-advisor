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
  type CallType,
  type CardPlayer,
  type PriceSignal,
  TRANSFER_HORIZON_WEIGHTS,
  evaluationRows,
  horizonTotal,
  horizonWeightsFor,
  kFor,
  priceWatch,
} from '@fpl/engine'
import { type PlanInput, type PlanPlayer, type PlannedCall, isDecidable, planWeek } from '../calls/plan.js'
import type { ModelCallRecord, ModelPort, ShortPlayer } from '../model/client.js'
import { keepLine } from '../calls/keep-line.js'
import { finalReasoning } from '../model/reasoning.js'

/** What the card shows for one player, plus the names the reasoning and the shortlist use. */
export type CardInfo = CardPlayer & {
  name: string
  club: string
  status: string
  /** FPL's forecast for tonight's price change, for the WATCH flag (STE-117). */
  priceSignal?: PriceSignal
}

const NO_SIGNAL: PriceSignal = { likelihoodTonight: null, locked: false }

/**
 * Which category's k the breakdown is showing (F4-AC-11). The figure alone does
 * not say — a substitution, a bench-order call and an armband call all read 0.5,
 * and only the label tells the manager he is looking at the captaincy bar rather
 * than the transfer one.
 */
/** What the model is told this move actually is. A bench-order swap is a substitution. */
const KIND: Readonly<Record<CallType, 'transfer' | 'substitution' | 'captain' | 'vice'>> = {
  transfer: 'transfer',
  substitution: 'substitution',
  bench_order: 'substitution',
  captain: 'captain',
  vice: 'vice',
}

const K_LABEL: Readonly<Record<CallType, string>> = {
  transfer: 'transfer',
  substitution: 'substitution',
  bench_order: 'substitution',
  captain: 'captain/vice',
  vice: 'captain/vice',
}

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
  /** Which category's k that is, in the manager's words (F4-AC-11). */
  kLabel: string
  /** The captaincy ceiling tie-break chose this challenger (F4-AC-12). */
  byCeiling: boolean
}

export type StoredCall = {
  key: string
  category: PlannedCall['category']
  shape: PlannedCall['shape']
  outPlayerId: number
  inPlayerId: number
  net: number
  /**
   * A keep reading — the advice is to hold what is there (F4-AC-01). It carries
   * no conviction and no band, because a reading rendered with a percentage is
   * the weak-change display F4-AC-02 forbids, and the table's own constraint
   * refuses one.
   */
  isReading: boolean
  /** The engine's own two, and only on a reading. */
  readingReason: 'incumbent_wins' | 'below_floor' | null
  conviction: number | null
  band: Band | null
  k: number
  pointsHit: number
  costTenths: number
  isForced: boolean
  /**
   * Set by code when FPL expects a price on either side of a transfer to move
   * tonight (STE-117). Never on a substitution, never from conviction. The
   * press-conference trigger has no source yet.
   */
  watch: boolean
  /** Why, one tap away on the card (F3-AC-18). Null when WATCH is not set. */
  watchReason: string | null
  reasoning: string
  reasoningSource: 'model' | 'template'
  /** What this run did to the call, until the card has been seen (F6-AC-13). */
  diffTag: 'new' | 'updated' | 'returned' | 'resurfaced' | 'band_move' | null
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
  /** Keys of rejected calls whose premise has moved, so they return labelled (F6-AC-03). */
  resurfaced?: ReadonlySet<string>
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

      // A keep reading is written here, not asked for. See `keep-line.ts` — the
      // model has no strength or band to be given, and the engine's fallback
      // sentence recommends the wrong player on a keep.
      if (call.outcome.reading !== 'call') {
        return {
          text: keepLine(call.outcome.reason, rows, out.name),
          source: 'template' as const,
          record: null,
        }
      }

      // A call that moves no money may not be explained in money (F4-AC-09,
      // F3-AC-28) — on such a call a sentence about freeing up funds is not a
      // weak argument, it is a false one.
      const kind = KIND[call.outcome.type]
      const written = await input.model.writeReasoning({
        outName: out.name,
        inName: into.name,
        rows,
        summary: { net: call.outcome.net, strength: call.outcome.conviction, band: call.outcome.band },
        kind,
      })
      return {
        ...finalReasoning(written.text, rows, out.name, into.name, { costsNothing: kind !== 'transfer' }),
        record: written.record,
      }
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
    // Everything that differs between a call and a keep reading, decided once.
    // A reading carries no k of its own, so the figure the breakdown shows is
    // resolved here from the call type — never a second time downstream.
    const figures = isDecidable(call)
      ? {
          isReading: false,
          readingReason: null,
          conviction: call.outcome.conviction,
          band: call.outcome.band,
          k: call.outcome.k,
          pointsHit: call.outcome.pointsHit,
          costTenths: call.outcome.costTenths,
          isForced: call.outcome.isForced,
          alternatives: call.alternatives ?? null,
        }
      : {
          isReading: true,
          readingReason: call.outcome.reason,
          conviction: null,
          band: null,
          k: kFor(call.outcome.type),
          pointsHit: 0,
          costTenths: 0,
          isForced: false,
          alternatives: null,
        }
    const outCard = card(call.outPlayerId)
    const inCard = card(call.inPlayerId)
    // Money moves only on a transfer, so only a transfer can be caught by a price change.
    const watchReason =
      call.category === 'transfer'
        ? priceWatch(
            { name: outCard.name, ...(outCard.priceSignal ?? NO_SIGNAL) },
            { name: inCard.name, ...(inCard.priceSignal ?? NO_SIGNAL) },
          )
        : null

    return {
      key: call.key,
      category: call.category,
      shape: call.shape,
      outPlayerId: call.outPlayerId,
      inPlayerId: call.inPlayerId,
      net: call.outcome.net,
      isReading: figures.isReading,
      readingReason: figures.readingReason,
      conviction: figures.conviction,
      band: figures.band,
      k: figures.k,
      pointsHit: figures.pointsHit,
      costTenths: figures.costTenths,
      isForced: figures.isForced,
      watch: watchReason !== null,
      watchReason,
      reasoning: line?.text ?? '',
      reasoningSource: line?.source ?? 'template',
      // A call the manager rejected, back because what he rejected has changed.
      // Labelled, never slipped in unmarked (F6-AC-03).
      diffTag: input.resurfaced?.has(call.key) === true ? 'resurfaced' : null,
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
        pointsHit: figures.pointsHit,
        k: figures.k,
        kLabel: K_LABEL[call.outcome.type],
        byCeiling: call.byCeiling === true,
      },
      alternatives: figures.alternatives,
      position,
    }
  })

  // A keep reading made no model call, so there is no record to keep for it.
  const written = lines.map((l) => l.record).filter((r): r is ModelCallRecord => r !== null)
  return { calls, modelCalls: [proposal.record, ...written] }
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
