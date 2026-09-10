/**
 * The starting constants.
 *
 * These are judgement calls tuned once against a real gameweek and then fixed —
 * never fitted to outcomes. The tuning pass was run on 2026-09-10 against GW4,
 * on the real squad rather than a hypothetical one, closing Decision Log #25.
 */
import type { Band, CallType } from './types.js'

/**
 * k is "the gain that should read as a coin flip" — the cost of taking that
 * action, expressed in points.
 *
 * A transfer consumes a free transfer that could have been banked, and carries
 * the higher bar. Everything else is free and reversible and shares the lower
 * one: the armband's k was 0.8 until 2026-09-10, justified by the variance an
 * armband exposes, and that job now belongs to the ceiling tie-break — which
 * left a captaincy call graded on a different scale from a substitution of the
 * same size, in the same gameweek, in the same units.
 */
export const K: Readonly<Record<CallType, number>> = {
  transfer: 2.0,
  substitution: 0.5,
  bench_order: 0.5,
  captain: 0.5,
  vice: 0.5,
}

/**
 * The point at which two options are indistinguishable given the inputs. It is
 * a conviction figure, so the *net* it corresponds to moves whenever k does —
 * `noiseFloorNet` is the only place that conversion is made.
 */
export const NOISE_FLOOR = 20

/** Band edges are exact, so F6's material-change rule has something to test. */
export const BAND_EDGES: Readonly<Record<Exclude<Band, 'thin'>, number>> = {
  certain: 90,
  strong: 80,
  lean: 60,
}

export const CLAMP = { min: 5, max: 95 } as const

/**
 * A transfer is a multi-week commitment and is scored over three gameweeks. A
 * substitution, a captaincy call and a vice call are one-week decisions — the
 * manager re-picks the eleven and the armband every week.
 */
export const TRANSFER_HORIZON_WEIGHTS: readonly number[] = [1, 0.6, 0.35]
export const SINGLE_GAMEWEEK_WEIGHTS: readonly number[] = [1]

/** Projected points are stored to two decimal places, so figures derived from
 *  them are held there too. That is what makes the arithmetic reproducible by
 *  hand rather than merely deterministic. */
export const round2 = (value: number): number => Math.round(value * 100) / 100

/** Float tolerance, for comparisons against a threshold rather than for
 *  rounding a result. */
export const EPSILON = 1e-9
