/**
 * The token that turns F7-AC-14 from a screen order into a mechanism.
 *
 * The criterion says the identifier is confirmed **before** it is linked, and
 * gives the reason: a mistyped identifier is usually still a *valid* one
 * belonging to a stranger, so without confirmation it links silently and every
 * call afterwards is built on someone else's squad.
 *
 * Until slice 10 nothing bound a confirm to a resolve — no token, no cached
 * candidate, no state on the row. A direct POST to confirm linked a team that
 * had never been shown back, and the guarantee lived entirely in `LinkTeam.tsx`.
 * It was left rather than answered with a nonce flow because the route is behind
 * a session and there is one user, which is true and is also exactly the
 * argument this project keeps refusing everywhere else: a convention wearing the
 * shape of a mechanism.
 *
 * **The token carries no identity.** Only an expiry and a signature reach the
 * browser; the user and the team id go into the signature's input and are
 * recomputed at verify time from the session cookie and the posted body. So
 * there is nothing to parse out of an untrusted string, and a captured token
 * says nothing about whose it was.
 *
 * Keyed by `SESSION_COOKIE_SECRET`, which has been required at boot since slice
 * 1 and read by nothing until now — `env.ts` said it signed the session cookie,
 * and the session cookie is 32 random bytes signed by nothing. This is what it
 * is actually for.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { CONFIRMATION_TTL_SECONDS } from '../auth/limits.js'

/**
 * Versioned, and the separators matter.
 *
 * Without a delimiter, user `ab` with team `1` and user `a` with team `b1` would
 * sign identically — the classic concatenation collision. The `v1` prefix means
 * a later change to what is signed cannot be replayed against this scheme.
 */
const sign = (secret: string, userId: string, fplTeamId: number, expiresAt: number): string =>
  createHmac('sha256', secret)
    .update(`team-link:v1:${userId}:${String(fplTeamId)}:${String(expiresAt)}`)
    .digest('base64url')

/** What `resolve` hands back, for `confirm` to require. */
export function mintConfirmation(
  secret: string,
  userId: string,
  fplTeamId: number,
  now: number = Date.now(),
): string {
  const expiresAt = Math.floor(now / 1000) + CONFIRMATION_TTL_SECONDS
  return `${String(expiresAt)}.${sign(secret, userId, fplTeamId, expiresAt)}`
}

/**
 * True only for a token this server minted, for this user, for this team, and
 * not yet expired. Anything else — missing, malformed, tampered, someone else's,
 * another team's, stale — is false, and the route says the same thing about all
 * of them.
 */
export function confirmationIsValid(
  secret: string,
  userId: string,
  fplTeamId: number,
  token: unknown,
  now: number = Date.now(),
): boolean {
  if (typeof token !== 'string') return false

  const [rawExpiry, mac] = token.split('.')
  const expiresAt = Number(rawExpiry)
  if (!Number.isInteger(expiresAt) || !mac) return false
  if (expiresAt * 1000 <= now) return false

  // Constant time, and length-checked first because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  const given = Buffer.from(mac)
  const expected = Buffer.from(sign(secret, userId, fplTeamId, expiresAt))
  return given.length === expected.length && timingSafeEqual(given, expected)
}
