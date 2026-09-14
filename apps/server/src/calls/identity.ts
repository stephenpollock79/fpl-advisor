/**
 * A stored call's engine identity, rebuilt from the row.
 *
 * The identity is what the engine keys its arithmetic on, and it is not stored:
 * the row carries a `shape` and a pair of player ids, which is enough to rebuild
 * it and one field fewer to keep in step.
 *
 * **One copy, deliberately.** This lived privately inside `world/assemble.ts`
 * until a second caller needed it (STE-130). A `shape` that gained a variant
 * would otherwise have had to be remembered in two places, and the second would
 * have gone wrong silently — the engine would simply have scored the call as
 * something else.
 */

import type { CallIdentity } from '@fpl/engine'
import type { CallShape } from './plan.js'

export type StoredShape = {
  shape: CallShape
  outPlayerId: number
  inPlayerId: number
}

export function identityOf(call: StoredShape): CallIdentity {
  switch (call.shape) {
    case 'transfer':
      return { type: 'transfer', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    case 'captain':
      return { type: 'captain', fromPlayerId: call.outPlayerId, toPlayerId: call.inPlayerId }
    case 'vice':
      return { type: 'vice', fromPlayerId: call.outPlayerId, toPlayerId: call.inPlayerId }
    case 'bench_order':
      // Slots are not on the row; the key already holds them and nothing here
      // rebuilds it, so the pair stands in for the identity's arithmetic only.
      return { type: 'bench_order', slotA: 0, slotB: 1 }
    default:
      return {
        type: 'substitution',
        variant: call.shape === 'forced_swap' ? 'forced' : call.shape === 'doubt_swap' ? 'doubt' : 'upgrade',
        outPlayerId: call.outPlayerId,
        inPlayerId: call.inPlayerId,
      }
  }
}
