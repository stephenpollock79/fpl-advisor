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
  authenticateRequest,
  clearedCookieHeader,
  cookieHeader,
  createSession,
  findSession,
  isSecureRequest,
  readCookie,
  revoke,
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

    // Derived from the request rather than from env.isProduction — see
    // isSecureRequest for why that distinction cost a production defect.
    const secure = isSecureRequest(c.req.url, c.req.header('X-Forwarded-Proto'))
    c.header('Set-Cookie', cookieHeader(token, secure))
    return c.json({ status: 'signed_in' })
  })

  app.post('/api/auth/logout', async (c) => {
    const token = readCookie(c.req.header('Cookie'))
    const session = token ? await findSession(token) : null
    if (session) await revoke(session.id)
    c.header(
      'Set-Cookie',
      clearedCookieHeader(isSecureRequest(c.req.url, c.req.header('X-Forwarded-Proto'))),
    )
    return c.json({ status: 'signed_out' })
  })

  app.get('/api/me', async (c) => {
    // authenticateRequest slides the thirty-day window as a side effect, which is
    // F7-AC-10 and is why no route resolves a session by hand.
    const session = await authenticateRequest(c.req.header('Cookie'))
    if (!session) return c.json({ error: 'not_signed_in' }, 401)

    const { data } = await userClient(session.accessToken)
      .from('manager')
      .select('user_id, fpl_team_id, team_name, manager_name, overall_rank')
      .maybeSingle()

    return c.json({ manager: data ?? null, needsTeamLink: !data?.['fpl_team_id'] })
  })

  return app
}
