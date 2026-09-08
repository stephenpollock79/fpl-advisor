/**
 * The four auth routes. Every one of them is a place a secret is touched, which
 * is why they are here and not in the browser (ADR 0005).
 *
 * Not in this slice, deliberately: the per-address and per-source-address rate
 * limits (F7-AC-06, F7-AC-07) and the enumeration hardening, which are slice 10.
 * Supabase enforces one code per address per sixty seconds today, which covers
 * part of F7-AC-06 — but its project-wide email cap is a blunt backstop and is
 * **not** the per-address hourly ceiling F7-AC-07 asks for. Do not tick that
 * criterion off against it.
 */

import { Hono } from 'hono'
import type { Env } from '../env.js'
import { authClient, userClient } from '../supabase.js'
import {
  cacheAccessToken,
  clearedCookieHeader,
  cookieHeader,
  createSession,
  findSession,
  readCookie,
  revoke,
  slide,
} from './session.js'

/**
 * The one response the login screen ever gets back.
 *
 * F7-AC-02, F7-AC-05 and F7-UP-01: nothing may follow from a submission that
 * distinguishes an authorised address from an unauthorised one. So this is
 * returned for a sent code, an unknown address and a throttled request alike,
 * and the provider's own error is swallowed rather than surfaced.
 */
const SAME_ANSWER = { status: 'code_requested' as const }

export function authRoutes(env: Env) {
  const app = new Hono()

  app.post('/api/auth/request-code', async (c) => {
    const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
    if (typeof email !== 'string' || !email.includes('@')) return c.json(SAME_ANSWER)

    // shouldCreateUser: false is what makes F7-AC-01 true at the API as well as
    // in the dashboard. Public sign-up being off at the provider is a setting;
    // this is the same statement in the code path, so neither alone is the
    // mechanism.
    await authClient()
      .auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      .catch(() => undefined)

    return c.json(SAME_ANSWER)
  })

  app.post('/api/auth/verify', async (c) => {
    const { email, code } = await c.req
      .json<{ email?: string; code?: string }>()
      .catch(() => ({ email: undefined, code: undefined }))
    if (typeof email !== 'string' || typeof code !== 'string') {
      return c.json({ error: 'invalid_code' }, 400)
    }

    const { data, error } = await authClient().auth.verifyOtp({ email, token: code, type: 'email' })
    const session = data?.session
    if (error || !session?.user) {
      // F7-UP-02: wrong, expired and already-used all read the same here. The
      // screen states it inline; the server does not explain which it was.
      return c.json({ error: 'invalid_code' }, 400)
    }

    const expiresAt = new Date((session.expires_at ?? 0) * 1000).toISOString()
    const token = await createSession(
      session.user.id,
      session.refresh_token,
      session.access_token,
      expiresAt,
    )

    // The account row is created on first sign-in, as the user, so the very
    // first write in the product goes through the policies rather than round
    // them. Slice 2 fills in the FPL team.
    await userClient(session.access_token)
      .from('manager')
      .upsert({ user_id: session.user.id }, { onConflict: 'user_id' })

    c.header('Set-Cookie', cookieHeader(token, env.isProduction))
    return c.json({ status: 'signed_in' })
  })

  app.post('/api/auth/logout', async (c) => {
    const token = readCookie(c.req.header('Cookie'))
    const session = token ? await findSession(token) : null
    if (session) await revoke(session.id)
    c.header('Set-Cookie', clearedCookieHeader(env.isProduction))
    return c.json({ status: 'signed_out' })
  })

  app.get('/api/me', async (c) => {
    const token = readCookie(c.req.header('Cookie'))
    const session = token ? await findSession(token) : null
    if (!session) return c.json({ error: 'not_signed_in' }, 401)

    const accessToken = await freshAccessToken(session)
    if (!accessToken) return c.json({ error: 'not_signed_in' }, 401)

    // Every authenticated request renews the window. This is F7-AC-10.
    await slide(session.id)

    const { data } = await userClient(accessToken)
      .from('manager')
      .select('user_id, fpl_team_id, team_name, manager_name, overall_rank')
      .maybeSingle()

    return c.json({ manager: data ?? null, needsTeamLink: !data?.['fpl_team_id'] })
  })

  return app
}

/** The cached token while it lives; a refresh when it does not. */
async function freshAccessToken(session: {
  id: string
  supabase_access_token: string | null
  access_token_expires_at: string | null
  supabase_refresh_token: string
}): Promise<string | null> {
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
