/**
 * The session: an opaque cookie, a row, and a thirty-day window that is ours.
 *
 * F7-AC-10 says the session is long and sliding — thirty days, renewed on each
 * visit. ADR 0007 says that window is ours rather than the provider's, because
 * Supabase's own inactivity timeout is a Pro-plan setting and the plan is funded
 * by a credit with a finite life. If the window were theirs, F7-AC-10 would stop
 * being true the month that credit lapsed, with nothing on screen to say so.
 */

import { createHash, randomBytes } from 'node:crypto'
import { authClient, sessionClient } from '../supabase.js'

export const COOKIE_NAME = 'gaffer_session'
export const WINDOW_DAYS = 30

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const windowEnd = () => new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

export type SessionRow = {
  id: string
  user_id: string
  supabase_refresh_token: string
  supabase_access_token: string | null
  access_token_expires_at: string | null
  expires_at: string
  revoked_at: string | null
}

/** Creates the row and returns the raw token, which is the only time it exists in the clear. */
export async function createSession(
  userId: string,
  refreshToken: string,
  accessToken: string,
  accessTokenExpiresAt: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const { error } = await sessionClient().from('app_session').insert({
    token_hash: hash(token),
    user_id: userId,
    supabase_refresh_token: refreshToken,
    supabase_access_token: accessToken,
    access_token_expires_at: accessTokenExpiresAt,
    expires_at: windowEnd(),
  })
  if (error) throw new Error(`could not create session: ${error.message}`)
  return token
}

/** The live row for a cookie, or null. Expired and revoked sessions are both null. */
export async function findSession(token: string): Promise<SessionRow | null> {
  const { data } = await sessionClient()
    .from('app_session')
    .select('id, user_id, supabase_refresh_token, supabase_access_token, access_token_expires_at, expires_at, revoked_at')
    .eq('token_hash', hash(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (data as SessionRow | null) ?? null
}

/** Slides the window forward. Called on every authenticated request — this *is* F7-AC-10. */
export async function slide(sessionId: string): Promise<void> {
  await sessionClient()
    .from('app_session')
    .update({ last_seen_at: new Date().toISOString(), expires_at: windowEnd() })
    .eq('id', sessionId)
}

export async function cacheAccessToken(
  sessionId: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  await sessionClient()
    .from('app_session')
    .update({ supabase_access_token: accessToken, access_token_expires_at: expiresAt })
    .eq('id', sessionId)
}

/** F7-AC-24: ending the session is a row change, not the client's word for it. */
export async function revoke(sessionId: string): Promise<void> {
  await sessionClient()
    .from('app_session')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
}

/**
 * Whether this request arrived over TLS, and therefore whether the session cookie
 * must carry `Secure`.
 *
 * **Not read from NODE_ENV.** It was, and the consequence shipped: Railway does
 * not set NODE_ENV, so the first production sign-in issued a session cookie with
 * no `Secure` flag — found on 2026-09-08 by reading the Set-Cookie header off the
 * deployed app. A flag that depends on a variable nobody set is a flag that is
 * silently off, which is the failure class this project keeps designing against.
 *
 * So it is derived from the request, and it **fails closed**: anything that is not
 * plainly local http gets `Secure`. Railway terminates TLS at its edge and
 * forwards `x-forwarded-proto`.
 */
export function isSecureRequest(url: string, forwardedProto: string | undefined): boolean {
  if (forwardedProto) return forwardedProto.split(',')[0]?.trim() === 'https'
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol === 'https:') return true
    return !isThisNetwork(hostname)
  } catch {
    return true
  }
}

export function cookieHeader(token: string, isProduction: boolean): string {
  // SameSite=Lax is sufficient and no CSRF token is needed, because ADR 0006
  // makes the client same-origin with the API — there is no cross-site form post
  // that could reach it. If a separate origin is ever introduced, that stops
  // being true.
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${WINDOW_DAYS * 24 * 60 * 60}`,
  ]
  if (isProduction) parts.push('Secure')
  return parts.join('; ')
}

export function clearedCookieHeader(isProduction: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']
  if (isProduction) parts.push('Secure')
  return parts.join('; ')
}

export function readCookie(header: string | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=') || null
  }
  return null
}

/** Who a request is, and the token that lets it read their rows. Always travels whole. */
export type AuthenticatedUser = { userId: string; accessToken: string }

/**
 * The signed-in user behind a cookie, with a token that can actually read their
 * rows — and the window slid forward, because every authenticated request renews
 * it (F7-AC-10).
 *
 * This is the single answer to "who is this request", so a route never has to
 * assemble it from parts and no route can accidentally skip the slide.
 */
export async function authenticateRequest(
  cookie: string | undefined,
): Promise<AuthenticatedUser | null> {
  const token = readCookie(cookie)
  const session = token ? await findSession(token) : null
  if (!session) return null

  const accessToken = await freshAccessToken(session)
  if (!accessToken) return null

  await slide(session.id)
  return { userId: session.user_id, accessToken }
}

/** The cached token while it lives; a refresh when it does not. */
async function freshAccessToken(session: SessionRow): Promise<string | null> {
  const expiry = session.access_token_expires_at
  const stillValid = expiry !== null && Date.parse(expiry) - Date.now() > 60_000
  if (stillValid && session.supabase_access_token) return session.supabase_access_token

  const { data } = await authClient().auth.refreshSession({
    refresh_token: session.supabase_refresh_token,
  })
  if (!data?.session) return null

  await cacheAccessToken(
    session.id,
    data.session.access_token,
    new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
  )
  return data.session.access_token
}

/**
 * Is this address on the machine or the local network?
 *
 * Used only to decide whether a **direct, plain-http** request may drop the
 * cookie's Secure flag. It is not a security boundary — the branch above gives
 * `x-forwarded-proto` the last word, so a proxy always wins and production, which
 * always arrives through one, never reaches this function's http path.
 *
 * Localhost alone was not enough. A phone on the same Wi-Fi reaches the dev
 * server by LAN address, and marking that cookie Secure makes the browser discard
 * it silently: the session row is created, the cookie never lands, and the screen
 * says "not signed in" with nothing anywhere to say why. Cost an evening on
 * 2026-09-09 before the request-code logging made it findable.
 */
function isThisNetwork(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  // mDNS names, which is how a Mac answers to its own hostname on a home network.
  if (hostname.endsWith('.local')) return true

  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false

  const [a, b] = parts as [number, number, number, number]
  // The three private IPv4 ranges, RFC 1918.
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}
