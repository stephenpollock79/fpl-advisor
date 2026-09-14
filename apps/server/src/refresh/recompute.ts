/**
 * The figures, kept true to the data beside them — for nothing (ruled
 * 2026-09-14, STE-65).
 *
 * **The useful split is not data versus advice. It is free versus paid.** Net,
 * conviction and band are arithmetic over published inputs (ENGINE-AC-04), so
 * re-deriving a stored call from the feed read the app just took costs nothing
 * and calls no model. Only two things cost money: proposing new candidates, and
 * writing the reasoning.
 *
 * **Recomputing is not a refresh, and the two must never be conflated.** A
 * refresh regenerates candidates, calls the model and discards pending calls
 * (F6-AC-04). This does none of those: it changes no call's existence, no call's
 * membership and no decision. So F6-AC-15's *nothing refreshes on its own* is
 * intact — nothing regenerates on its own; a displayed figure simply stops being
 * allowed to contradict the data on screen next to it.
 *
 * What it *does* produce is the report gate: F6-AC-06's band crossing, or a call
 * that can no longer be executed. Those were previously invisible without paying.
 */

import { type Band, bandOf, evaluateCall, isBelowFloor } from '@fpl/engine'
import type { CallIdentity } from '@fpl/engine'

/** A stored call, reduced to what re-deriving its figure needs. */
export type StoredFigure = {
  key: string
  identity: CallIdentity
  outPlayerId: number
  inPlayerId: number
  conviction: number | null
  band: Band | null
  isReading: boolean
  pointsHit: number
}

export type Recomputed = {
  key: string
  net: number
  conviction: number | null
  band: Band | null
  isReading: boolean
  /** The figure this call carried before, where the band moved (F6-AC-11). */
  previousConviction: number | null
  /** F6-AC-06's first limb. */
  movedBand: boolean
  /**
   * F6-AC-06's second limb — the call cannot be executed any more. Either side
   * having left the squad, or the incoming player failing the gate.
   */
  unexecutable: boolean
}

export type SideNow = {
  playerId: number
  projections: readonly number[]
  availability: { eligible: boolean; reason?: string }
  /** From the fixture table, never from the projection (PRD 3.5). */
  hasFixture: boolean
  inSquad: boolean
}

/**
 * Re-derive one call from the world as it stands now.
 *
 * Returns `null` where the call names a player the latest read no longer knows —
 * a genuinely unrecomputable call, which is reported as unexecutable rather than
 * quietly left at its old figure.
 */
export function recomputeCall(call: StoredFigure, sides: Map<number, SideNow>): Recomputed {
  const out = sides.get(call.outPlayerId)
  const into = sides.get(call.inPlayerId)

  const gone = !out || !into
  // An incoming player the gate now excludes can never be recommended
  // (ENGINE-AC-02), so the call cannot be executed whatever its arithmetic said.
  const excluded = into !== undefined && !into.availability.eligible
  if (gone || excluded) {
    return {
      key: call.key,
      net: 0,
      conviction: null,
      band: null,
      isReading: true,
      previousConviction: call.conviction,
      movedBand: false,
      unexecutable: true,
    }
  }

  const side = (p: SideNow, weeks: number) => ({
    playerId: p.playerId,
    projections: weeks === 1 ? [p.hasFixture ? (p.projections[0] ?? 0) : 0] : p.projections.slice(0, weeks),
    availability: p.availability.eligible
      ? ({ eligible: true } as const)
      : ({ eligible: false, reason: 'unavailable' } as const),
  })

  const weeks = call.identity.type === 'transfer' ? 3 : 1
  const outcome = evaluateCall({
    identity: call.identity,
    incumbent: side(out, weeks),
    challenger: side(into, weeks),
    pointsHit: call.pointsHit,
    incumbentUnplayable: !out.hasFixture,
  })

  const nowReading = outcome.reading !== 'call'
  const nowConviction = outcome.reading === 'call' ? outcome.conviction : null
  const nowBand = outcome.reading === 'call' ? outcome.band : null

  // A band move is a move between named bands. A call becoming a reading, or a
  // reading becoming a call, is a bigger change than a band move and is reported
  // as one — the tag says the figure moved, and the card already shows which.
  const movedBand = call.isReading !== nowReading || call.band !== nowBand

  return {
    key: call.key,
    net: outcome.net,
    conviction: nowConviction,
    band: nowBand,
    isReading: nowReading,
    previousConviction: movedBand ? call.conviction : null,
    movedBand,
    unexecutable: false,
  }
}

/** Every stored call, re-derived. Reported only where F6-AC-06 says to report. */
export function recomputeAll(
  calls: readonly StoredFigure[],
  sides: Map<number, SideNow>,
): { all: Recomputed[]; reported: Recomputed[] } {
  const all = calls.map((call) => recomputeCall(call, sides))
  return { all, reported: all.filter((r) => r.movedBand || r.unexecutable) }
}

/** Exported so a test can prove the report gate is the criterion's, not a feeling. */
export const isReportable = (r: Recomputed): boolean => r.movedBand || r.unexecutable

export { bandOf, isBelowFloor }
