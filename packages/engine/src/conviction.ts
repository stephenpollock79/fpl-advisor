/**
 * ENGINE-AC-03 — conviction, and the guard that keeps it honest.
 *
 * `100 × net ÷ (net + k)` is a curve with diminishing returns that cannot exceed
 * 100. Net is non-negative by construction, and that is a precondition of the
 * formula rather than a coincidence: fed a negative net the curve is undefined
 * at `net = −k`, and below that returns a large *positive* number that would
 * clamp to 95 and read as *certain* — a bad call rendering as the strongest
 * thing the app can say. Decision Log #59 found that with a pencil.
 *
 * So the function refuses a negative net rather than computing one. Direction is
 * resolved before this point, in `call.ts`, by choosing the winning side; this
 * guard is the second line, and any code path that can reach it with a negative
 * number is a defect.
 */
import { BAND_EDGES, CLAMP, K, NOISE_FLOOR } from './constants.js'
import type { Band, CallType } from './types.js'

export const kFor = (type: CallType): number => K[type]

/**
 * The net at which conviction is exactly the noise floor.
 *
 * The floor is stated as a conviction figure, so the points it corresponds to
 * move whenever k does — at a transfer's k of 2.0 it is half a point across
 * three gameweeks, at the armband's 0.5 it is an eighth of a point in one. This
 * is the only place that conversion is made.
 */
export const noiseFloorNet = (k: number): number => (k * NOISE_FLOOR) / (100 - NOISE_FLOOR)

export const convictionOf = (net: number, k: number): number => {
  if (!Number.isFinite(net) || net < 0) {
    throw new Error(
      `conviction is undefined for a negative net (${String(net)}); the winning side is the recommendation`,
    )
  }

  const raw = (100 * net) / (net + k)
  const rounded = Math.round(raw)

  return Math.min(CLAMP.max, Math.max(CLAMP.min, rounded))
}

export const bandOf = (conviction: number): Band => {
  if (conviction >= BAND_EDGES.certain) return 'certain'
  if (conviction >= BAND_EDGES.strong) return 'strong'
  if (conviction >= BAND_EDGES.lean) return 'lean'
  return 'thin'
}

export const isBelowFloor = (conviction: number): boolean => conviction < NOISE_FLOOR
