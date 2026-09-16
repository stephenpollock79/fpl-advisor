/**
 * In-memory stand-ins for `auth_throttle`, so the route tests are instant and an
 * hour-long window costs no wall time.
 *
 * **These do not stand in for the real thing being tested.** The enforcement
 * itself is a SQL function, and `tests/auth/throttle.pg.test.ts` exercises that
 * one against the real migration under the real grants. What these prove is the
 * routes: which limits get asked, with which subjects, on which paths, and what
 * the caller is told. Two different questions, deliberately answered by two
 * different harnesses.
 */

import type { AttemptStore, ThrottleAsk, ThrottleStore } from '../../apps/server/src/auth/throttle.js'

export type Clock = { now: number; advance: (seconds: number) => void }

export const clock = (): Clock => ({
  now: 0,
  advance(seconds: number) {
    this.now += seconds
  },
})

type Window = { start: number; hits: number }

export type MemoryThrottle = ThrottleStore & {
  /** Every subject this store has ever been asked about, so a test can prove none is an address. */
  seen: Set<string>
  /** Turns the store into one that is down, for the fail-closed case. */
  breakIt: () => void
}

export function memoryThrottle(c: Clock, attempts?: MemoryAttempts): MemoryThrottle {
  const windows = new Map<string, Window>()
  let broken = false

  return {
    seen: new Set<string>(),
    breakIt() {
      broken = true
    },
    async allow(asks: ThrottleAsk[], clearAttemptsFor?: string): Promise<boolean> {
      for (const a of asks) this.seen.add(a.subject)
      // Fail closed, exactly as `throttle.pg.ts` does.
      if (broken) return false

      // Pass one: roll expired windows and read, incrementing nothing — the same
      // two-pass shape the SQL uses, so a denial consumes no allowance.
      let allowed = true
      for (const a of asks) {
        const key = `${a.kind}:${a.subject}`
        const w = windows.get(key) ?? { start: c.now, hits: 0 }
        if (w.start + a.windowSeconds <= c.now) {
          w.start = c.now
          w.hits = 0
        }
        windows.set(key, w)
        if (w.hits >= a.limit) allowed = false
      }
      if (!allowed) return false

      for (const a of asks) {
        const w = windows.get(`${a.kind}:${a.subject}`)!
        w.hits += 1
      }
      if (clearAttemptsFor !== undefined) attempts?.forget(clearAttemptsFor)
      return true
    },
  }
}

export type MemoryAttempts = AttemptStore & {
  forget: (subject: string) => void
  countOf: (subject: string) => number
}

export function memoryAttempts(allowed = 5): MemoryAttempts {
  const counts = new Map<string, number>()
  return {
    async spent(subject: string) {
      return (counts.get(subject) ?? 0) >= allowed
    },
    async bump(subject: string) {
      const next = (counts.get(subject) ?? 0) + 1
      counts.set(subject, next)
      return { nowSpent: next >= allowed }
    },
    async clear(subject: string) {
      counts.delete(subject)
    },
    forget(subject: string) {
      counts.delete(subject)
    },
    countOf(subject: string) {
      return counts.get(subject) ?? 0
    },
  }
}
