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
    /**
     * **One call carrying the ranking (STE-151), re-derived as a captaincy.**
     *
     * Which of the two armbands actually moved is not recoverable from the
     * shape, and it does not need to be: both use the same bar, both print the
     * same `captain/vice` label, and the key is never rebuilt from here — it is
     * passed through. So the captaincy arithmetic is the arithmetic, whichever
     * half the call was about.
     */
    case 'armband':
      return { type: 'captain', fromPlayerId: call.outPlayerId, toPlayerId: call.inPlayerId }
    /**
     * **Named rather than defaulted, and that is the point.**
     *
     * This ended in `default:` until 2026-09-20, so the day `armband` was added
     * to the shape union every stored armband call quietly re-derived as a
     * *substitution* — wrong bar, wrong label, no error anywhere. A catch-all
     * absorbing a case nobody thought about is the same failure as a test that
     * names a criterion and exercises the other half of it (P16).
     *
     * Listed explicitly so the compiler demands an answer for the next one.
     */
    case 'forced_swap':
      return { type: 'substitution', variant: 'forced', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    case 'doubt_swap':
      return { type: 'substitution', variant: 'doubt', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    case 'upgrade_swap':
      return { type: 'substitution', variant: 'upgrade', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    default: {
      /**
       * **Both halves matter, and they guard different things.**
       *
       * The assignment is a compile-time tripwire: add a shape to the union and
       * this stops type-checking until it is named above. That is what the old
       * `default:` arm silently removed, and how `armband` came to re-derive as
       * a substitution.
       *
       * The return is a runtime floor. `shape` is a column, and a row written
       * by a newer build — or by hand — can hold a value this one has never
       * heard of. **That is data, not a case**, and one unreadable row must not
       * throw through a world read that is otherwise fine.
       */
      const unknown: never = call.shape
      console.warn(`[calls] a stored call carries an unknown shape: ${String(unknown)}`)
      return { type: 'substitution', variant: 'upgrade', outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId }
    }
  }
}
