/**
 * What the throttle counts against: a digest, never an address.
 *
 * `auth_throttle` is written before anyone is authenticated, so its rows are the
 * only place in this system that records an unauthenticated stranger's input. A
 * table of email addresses that tried to sign in is worth more to somebody than
 * anything else it holds, and it has no business existing.
 */

import { createHmac } from 'node:crypto'

/**
 * **Normalised before it is hashed, or the limit is bypassed by pressing shift.**
 *
 * `A@x.com` and `a@x.com` are the same mailbox and hash differently, so without
 * this each capitalisation gets its own bucket and F7-AC-06's per-address
 * ceiling counts nothing. Trimming matters for the same reason — a phone
 * keyboard's trailing space is free.
 */
export const normaliseAddress = (email: string): string => email.trim().toLowerCase()

/**
 * **HMAC rather than a bare hash, and the difference is not cosmetic.**
 *
 * An email address is a guessable input: a plain SHA-256 column can be tested
 * against any address you can think of, so it is reversible for exactly the
 * addresses anyone would care about. Keyed with a secret nobody outside the
 * server holds, it is not — and the key costs nothing, because
 * `SESSION_COOKIE_SECRET` has been required at boot since slice 1.
 */
export const subjectOf = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url')

/**
 * The source address, for F7-AC-06's third ceiling.
 *
 * **The LAST entry, not the first.** `X-Forwarded-For` is append-only: every
 * proxy adds the address it saw. Railway's edge is the only hop in front of this
 * process that we trust, so the entry *it* appended is the rightmost one, and
 * that is the only element of the header a caller cannot author. Taking the
 * leftmost — the conventional "real client IP" — would let any request choose
 * its own bucket with one header, and a ceiling you can opt out of is not a
 * ceiling.
 *
 * **Deliberately not the same rule as `isSecureRequest`'s**, which takes the
 * FIRST element of `X-Forwarded-Proto`. That is correct there: the leftmost
 * proto is the client-to-edge protocol, and reading it wrong fails closed. Here
 * the leftmost is attacker input and reading it wrong fails open. Do not make
 * these two consistent.
 *
 * **What this is worth, stated plainly.** It stops a caller shifting its own
 * bucket, which is the difference between a limit and a decoration. It does not
 * stop a caller changing source address — an IPv6 client has a /64 to walk
 * through and a datacentre range defeats it outright. The per-address ceiling is
 * what actually protects an authorised inbox and the send allowance, and that
 * one is unaffected by any of this.
 */
export function sourceAddress(forwardedFor: string | undefined): string {
  const chain = (forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  // No header at all means a direct connection, which in production does not
  // happen — every request arrives through Railway's edge. One bucket for the
  // case is right: it is a single unknown source, not an exemption.
  return chain.at(-1) ?? 'unknown'
}
