/**
 * The contracts the auth routes know about, and nothing else.
 *
 * The routes take these rather than a database client so they can be driven from
 * a test — the shape every other route factory in this server already uses. The
 * real implementations are in `throttle.pg.ts`; the tests drive an in-memory one
 * with an injectable clock, so a window can be advanced without sleeping.
 */

export type ThrottleKind = 'address_minute' | 'address_hour' | 'source_hour'

/** One limit, asked about one subject. `subject` is always a digest (see `subject.ts`). */
export type ThrottleAsk = {
  kind: ThrottleKind
  subject: string
  limit: number
  windowSeconds: number
}

export type ThrottleStore = {
  /**
   * True when **every** limit passed, and only then is anything counted.
   *
   * **Asked once, with all the limits, rather than once per limit.** F7-AC-07
   * requires a throttled request to be indistinguishable from an accepted one,
   * and the leak this slice closes was a clock rather than a body — so an
   * accepted request must not do more work than a throttled one. One call keeps
   * that true by construction instead of by care.
   */
  allow: (asks: ThrottleAsk[]) => Promise<boolean>
}

export type AttemptStore = {
  /** True once the code is spent (F7-AC-09). Read before the provider is called. */
  spent: (subject: string) => Promise<boolean>
  /** Counts one wrong attempt. Called only after a verification actually failed. */
  bump: (subject: string) => Promise<void>
  /** Forgets the count — a fresh code was sent, or a sign-in succeeded. */
  clear: (subject: string) => Promise<void>
}
