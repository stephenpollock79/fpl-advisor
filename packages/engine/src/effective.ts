/**
 * ENGINE-AC-01 — effective points is the bought-in feed's projection, taken
 * whole. No multiplier, coefficient or haircut of any kind is applied by this
 * build.
 *
 * The feed already prices availability and expected starting: a defender ruled
 * out projects zero across every gameweek he misses, and a fully fit, unflagged
 * player projects 0.7 because he is not expected to start. A second adjustment
 * would be a discount on a discount — and could only be applied correctly by
 * first removing the feed's own, which means reverse-engineering a bought-in
 * projection. That is out of scope, which is why this is not a tuning question
 * but a closed one.
 *
 * `effectivePoints` takes one argument and will never take two. Giving it sight
 * of the availability gate is the single edit that would turn a mechanism back
 * into a convention.
 */
import { SINGLE_GAMEWEEK_WEIGHTS, TRANSFER_HORIZON_WEIGHTS, round2 } from './constants.js'
import type { CallType } from './types.js'

export const effectivePoints = (projection: number): number => projection

export const horizonWeightsFor = (type: CallType): readonly number[] =>
  type === 'transfer' ? TRANSFER_HORIZON_WEIGHTS : SINGLE_GAMEWEEK_WEIGHTS

/**
 * The weighted total across a call's horizon, and the only arithmetic this
 * build performs on a projection.
 *
 * A mismatch between the projections supplied and the weights for the call type
 * is a defect rather than something to absorb: scoring a transfer over one
 * gameweek, or a substitution over three, would produce a plausible figure that
 * is answering a different question.
 */
export const horizonTotal = (
  projections: readonly number[],
  weights: readonly number[],
): number => {
  if (projections.length !== weights.length) {
    throw new Error(
      `horizon mismatch: ${String(projections.length)} projections against ${String(
        weights.length,
      )} weights`,
    )
  }

  let total = 0
  for (let index = 0; index < projections.length; index++) {
    total += effectivePoints(projections[index] ?? 0) * (weights[index] ?? 0)
  }

  return round2(total)
}
