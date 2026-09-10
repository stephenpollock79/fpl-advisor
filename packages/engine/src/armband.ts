/**
 * F4-AC-01, F4-AC-12 — who wears the armband.
 *
 * Ruled 2026-09-10: the captain is the eligible player with the highest
 * projection for the gameweek, and the vice is the second-highest. There is no
 * probability multiplier anywhere. The figure that was going to supply one — the
 * availability multiplier — no longer exists, and the substitute everyone
 * reaches for, FPL's chance-of-playing percentage, re-creates on a different
 * line exactly the double-count that removed the multiplier.
 *
 * The one thing that does not come straight off the projection is a near-tie.
 * Doubling a score rewards the upper tail, and the bought-in feed publishes a
 * mean with no distribution, so xPts cannot express a ceiling. Inside the noise
 * floor — where the means have already been declared indistinguishable — the
 * greater ceiling decides, on two published, non-modelled signals in order:
 * whether he takes penalties, then position.
 */
import { EPSILON } from './constants.js'
import { kFor, noiseFloorNet } from './conviction.js'
import type { Armband, ArmbandCandidate, Position } from './types.js'

const POSITION_RANK: Readonly<Record<Position, number>> = { FWD: 0, MID: 1, DEF: 2, GKP: 3 }

/** Negative where `a` has the greater ceiling. The last two clauses are not
 *  ceiling signals — they make the answer the same on every run, which the
 *  reproducibility rule requires. */
const byCeiling = (a: ArmbandCandidate, b: ArmbandCandidate): number => {
  if (a.takesPenalties !== b.takesPenalties) return a.takesPenalties ? -1 : 1

  const position = POSITION_RANK[a.position] - POSITION_RANK[b.position]
  if (position !== 0) return position

  if (a.projection !== b.projection) return b.projection - a.projection

  return a.playerId - b.playerId
}

const byProjection = (a: ArmbandCandidate, b: ArmbandCandidate): number =>
  b.projection - a.projection || a.playerId - b.playerId

const pick = (
  pool: readonly ArmbandCandidate[],
): { chosen: ArmbandCandidate; decidedByCeiling: boolean } => {
  const highest = [...pool].sort(byProjection)[0]
  if (highest === undefined) throw new Error('no candidate to choose from')

  const window = noiseFloorNet(kFor('captain'))
  const contenders = pool.filter(
    (candidate) => highest.projection - candidate.projection <= window + EPSILON,
  )

  const chosen = [...contenders].sort(byCeiling)[0] ?? highest

  return { chosen, decidedByCeiling: chosen.playerId !== highest.playerId }
}

/**
 * Both armbands, in one call. They are separate assignments that cannot be held
 * by the same player, so the vice is chosen the same way over whoever is left
 * rather than by a second rule.
 *
 * Fewer than two eligible players is not a state to guess at. It is a squad the
 * gate has emptied, and the caller has to say so on screen rather than have an
 * armband invented for it.
 */
export const chooseArmband = (candidates: readonly ArmbandCandidate[]): Armband => {
  const eligible = candidates.filter((candidate) => candidate.availability.eligible)

  if (eligible.length < 2) {
    throw new Error(
      `an armband pair needs two eligible players; the gate left ${String(eligible.length)}`,
    )
  }

  const captain = pick(eligible)
  const vice = pick(eligible.filter((candidate) => candidate.playerId !== captain.chosen.playerId))

  return {
    captainId: captain.chosen.playerId,
    viceId: vice.chosen.playerId,
    captainByCeiling: captain.decidedByCeiling,
    viceByCeiling: vice.decidedByCeiling,
  }
}
