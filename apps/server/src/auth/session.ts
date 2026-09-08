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
import { sessionClient } from '../supabase.js'

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
