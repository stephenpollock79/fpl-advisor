/**
 * The throttle and the attempt counter, over `auth_throttle`.
 *
 * **Thin on purpose.** All the deciding happens in the SQL functions the
 * migration creates, not here — which is what lets `tests/auth/throttle.pg.test.ts`
 * exercise the production logic verbatim against real Postgres, including the
 * two-callers-at-once case that cannot be reached from TypeScript at all. Written
 * as read-then-write in this file it would be a race, a timing oracle, and
 * testable only as a re-implementation of itself.
 */

import { throttleClient } from '../supabase.js'
import { VERIFY_ATTEMPTS } from './limits.js'
import type { AttemptStore, ThrottleAsk, ThrottleStore } from './throttle.js'

export const pgThrottleStore: ThrottleStore = {
  async allow(asks: ThrottleAsk[]): Promise<boolean> {
    const { data, error } = await throttleClient().rpc('auth_throttle_take', { p_asks: asks })

    if (error) {
      /**
       * **Fail closed: no store, no send.**
       *
       * The caller cannot tell — the route returns the same body either way — so
       * this costs nothing observable and it does not burn the provider's send
       * allowance on a database blip. "The throttle is down, so sending is down"
       * is a coherent posture; "the throttle is down, so everything is allowed"
       * is how a limit stops existing at the exact moment it is under load.
       *
       * console.error rather than warn: this is the one condition here that an
       * operator has to be able to find.
       */
      console.error(`[auth] throttle unavailable, denying the send: ${error.message}`)
      return false
    }

    return data === true
  },
}

export const pgAttemptStore: AttemptStore = {
  async spent(subject: string): Promise<boolean> {
    const { data, error } = await throttleClient().rpc('auth_attempt_hits', {
      p_subject: subject,
      p_window_seconds: VERIFY_ATTEMPTS.windowSeconds,
    })

    if (error) {
      // Fail closed again, and it reads harsher than it is: the manager requests
      // a fresh code, which clears the count. Failing open here would leave the
      // six-digit code with nothing between it and an unbounded guessing loop.
      console.error(`[auth] attempt counter unavailable, treating the code as spent: ${error.message}`)
      return true
    }

    return (data as number) >= VERIFY_ATTEMPTS.allowed
  },

  async bump(subject: string): Promise<void> {
    const { error } = await throttleClient().rpc('auth_attempt_bump', {
      p_subject: subject,
      p_window_seconds: VERIFY_ATTEMPTS.windowSeconds,
    })
    if (error) console.error(`[auth] could not count a failed attempt: ${error.message}`)
  },

  async clear(subject: string): Promise<void> {
    const { error } = await throttleClient().rpc('auth_attempt_clear', { p_subject: subject })
    if (error) console.error(`[auth] could not clear the attempt count: ${error.message}`)
  },
}
