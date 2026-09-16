/**
 * Every threshold in the hardening pass, in one place.
 *
 * They live together rather than beside the code that uses them because they are
 * the values `docs/specs/slice-10-f7-hardening.md` names, and a value that is
 * stated in a spec and typed again at the call site is a value with two owners
 * (P17). Changing one here changes it everywhere it is asked about.
 */

const HOUR = 3600

/** F7-AC-06's sixty-second spacing. Supabase enforces its own; this is ours. */
export const ADDRESS_MINUTE = { windowSeconds: 60, limit: 1 } as const

/**
 * F7-AC-06's "small hourly ceiling per address". Ruled at five by Stephen on
 * 2026-09-16.
 *
 * The sixty-second spacing alone would permit sixty an hour, so the ceiling is
 * the limit that actually binds — five leaves room for a code that does not
 * arrive plus a couple of retries, and is small enough that flooding an
 * authorised inbox or burning the provider's send allowance is not worth doing.
 */
export const ADDRESS_HOUR = { windowSeconds: HOUR, limit: 5 } as const

/**
 * F7-AC-06's "matching ceiling per source address" — matching, so the same five.
 *
 * This one stops a caller walking a list of addresses from one machine. It does
 * not stop a caller changing machine, and it is not pretending to: see
 * `sourceAddress` for what a source address is actually worth.
 */
export const SOURCE_HOUR = { windowSeconds: HOUR, limit: 5 } as const

/**
 * F7-AC-09: a code dies after five wrong attempts.
 *
 * **The window is an hour, deliberately longer than the code itself lives.** The
 * counter is reset by an event rather than by a clock — a code that is actually
 * sent clears it — so a window longer than the code's life costs nothing, while
 * a window shorter than it would let a patient attacker wait out the counter and
 * carry on guessing the same live code. Pinning this to the provider's OTP
 * expiry would make a Supabase console setting load-bearing for a security
 * control, which is the kind of dependency that breaks silently.
 */
export const VERIFY_ATTEMPTS = { windowSeconds: HOUR, allowed: 5 } as const

/**
 * F7-AC-14: how long a resolved team stays confirmable.
 *
 * Long enough to read the confirmation card without hurrying, short enough that
 * a token captured somewhere is useless by the time anyone looks at it.
 */
export const CONFIRMATION_TTL_SECONDS = 600
