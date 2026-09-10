/**
 * F3-AC-04 — the outfield bench, in the order it should be.
 *
 * Ruled 2026-09-10: order by projected points, highest first. The probability an
 * auto-substitution fires for the slot a bench player covers was going to supply
 * a multiplier, and there is no such figure — for the same reason there is none
 * for the vice armband, and the same reason a substitute for it would be worse
 * than none.
 *
 * A player the gate has excluded covers nothing, so he goes last whatever he
 * projects. His projection is not altered to say so.
 */
import type { BenchCandidate } from './types.js'

export const benchOrder = (bench: readonly BenchCandidate[]): readonly BenchCandidate[] =>
  [...bench].sort((a, b) => {
    if (a.availability.eligible !== b.availability.eligible) {
      return a.availability.eligible ? -1 : 1
    }

    if (a.projection !== b.projection) return b.projection - a.projection

    return a.playerId - b.playerId
  })
