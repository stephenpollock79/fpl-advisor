/**
 * The recommendation and conviction engine.
 *
 * One function produces net, conviction and band, and both F3 and F4 read it —
 * never a second implementation, and never a figure recomputed inside a
 * component. The model proposes candidates and writes the reasoning; every
 * number shown is arithmetic over published data, so the same inputs produce the
 * same figure on every run and a figure that moves without an input moving is a
 * defect rather than a judgement that changed.
 *
 * The package declares no dependencies and is granted neither runtime's type
 * surface (ADR 0006). Both are asserted in tests/engine-package-boundary.test.ts
 * rather than trusted.
 */
export const ENGINE_PLACEHOLDER_VERSION = '0.0.0'

export function engineIdentity(): string {
  return `@fpl/engine@${ENGINE_PLACEHOLDER_VERSION}`
}

export * from './types.js'
export {
  BAND_EDGES,
  CLAMP,
  K,
  NOISE_FLOOR,
  SINGLE_GAMEWEEK_WEIGHTS,
  TRANSFER_HORIZON_WEIGHTS,
} from './constants.js'
export { availabilityOf } from './availability.js'
export { effectivePoints, horizonTotal, horizonWeightsFor } from './effective.js'
export { bandOf, convictionOf, isBelowFloor, kFor, noiseFloorNet } from './conviction.js'
export { sellingPriceTenths, transferCostTenths } from './money.js'
export { callKey } from './call-key.js'
export { chooseArmband } from './armband.js'
export { benchOrder } from './bench.js'
export { evaluateCall } from './call.js'
