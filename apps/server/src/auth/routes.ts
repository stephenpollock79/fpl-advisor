/**
 * The four auth routes. Every one of them is a place a secret is touched, which
 * is why they are here and not in the browser (ADR 0005).
 *
 * **Slice 10 (STE-68) is where these stopped being honest by luck.** Until now
 * the response body was already identical for every case — a sent code, an
 * unknown address, a throttled request — and the criterion was still false,
 * because the *duration* was not. A real send waits on SMTP: measured against
 * dev on 2026-09-08, an address with an account took 3.46s and one without took
 * 0.045s. Seventy-seven times is not a subtle signal. Anyone could ask this
 * route whether any address they liked had access, and F7-AC-02 forbids exactly
 * that.
 *
 * So the send is started and not waited for, and every limit is asked in one
 * database call. Both are timing properties rather than tidiness, and both are
 * easy to undo by accident — see the comments where they live.
 *
 * Dependencies are injected rather than imported so these routes can be driven
 * from a test, which they could not be before: the real ones are in `wire.ts`,
 * matching `world/wire.ts` and every other route factory in this server.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from './session.js'
import {
  clearedCookieHeader,
  cookieHeader,
  isSecureRequest,
} from './session.js'
import { ADDRESS_HOUR, ADDRESS_MINUTE, SOURCE_HOUR } from './limits.js'
import { normaliseAddress, sourceAddress } from './subject.js'
import type { AttemptStore, ThrottleStore } from './throttle.js'

/** What the provider hands back when a code checks out. */
export type VerifiedSession = {
  userId: string
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: string
}

export type ManagerRow = {
  user_id: string
  fpl_team_id: number | null
  team_name: string | null
  manager_name: string | null
  overall_rank: number | null
}

export type AuthDeps = {
  /** The provider send. Returns rather than throws, and the route never awaits it. */
  sendCode: (email: string) => Promise<{ error?: { message?: string } | null }>
  /** Null for wrong, expired and already-used alike — the route may not tell them apart. */
  verifyCode: (email: string, code: string) => Promise<VerifiedSession | null>
  createSession: (session: VerifiedSession) => Promise<string>
  ensureManagerRow: (session: VerifiedSession) => Promise<void>
  endSession: (cookie: string | undefined) => Promise<void>
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  readManager: (user: AuthenticatedUser) => Promise<ManagerRow | null>
  /** Pre-keyed with SESSION_COOKIE_SECRET by `wire.ts`, so no secret reaches this file. */
  subjectOf: (value: string) => string
  throttle: ThrottleStore
  attempts: AttemptStore
}

/**
 * The one response the login screen ever gets back.
 *
 * F7-AC-02, F7-AC-05, F7-AC-07 and F7-UP-01: nothing may follow from a
 * submission that distinguishes an authorised address from an unauthorised one.
 * So this is returned for a sent code, an unknown address, a throttled request
 * and a throttle store that is down, alike.
 *
 * **Nothing may be added beside it either** — no `Retry-After`, no
 * `X-RateLimit-Remaining`, no different status on the throttled path. Each of
 * those is the standard, helpful thing to do and each one hands a stranger the
 * limit, which F7-AC-07 names in as many words.
 */
const SAME_ANSWER = { status: 'code_requested' as const }

export function authRoutes(deps: AuthDeps) {
  const app = new Hono()

  app.post('/api/auth/request-code', async (c) => {
    const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
    // Returns before touching anything, and that is not a leak: it separates
    // junk from well-formed, never authorised from unauthorised. Do not "fix"
    // it with an artificial delay.
    if (typeof email !== 'string' || !email.includes('@')) return c.json(SAME_ANSWER)

    const address = normaliseAddress(email)
    const addressSubject = deps.subjectOf(address)
    const sourceSubject = deps.subjectOf(sourceAddress(c.req.header('X-Forwarded-For')))

    /**
     * **All three limits in one call, and the attempt reset folded into it.**
     *
     * F7-AC-06's three ceilings are asked together so that an accepted request
     * and a throttled one perform identical work. Splitting this into a check
     * and a record, or moving the reset out to its own call, puts back a
     * duration difference between the two paths — the same oracle this route
     * just closed, smaller but no less usable.
     */
    const allowed = await deps.throttle.allow(
      [
        { kind: 'address_minute', subject: addressSubject, ...ADDRESS_MINUTE },
        { kind: 'address_hour', subject: addressSubject, ...ADDRESS_HOUR },
        { kind: 'source_hour', subject: sourceSubject, ...SOURCE_HOUR },
      ],
      // Only reaches the database on the allowed path. A throttled request sends
      // nothing, so the previous code is still live and its attempt count must
      // stand (F7-AC-09).
      addressSubject,
    )

    if (allowed) {
      /**
       * **Started, never awaited.** This single `void` is the whole of
       * F7-AC-02, F7-AC-05 and F7-UP-01: awaiting it publishes, on a clock,
       * whether the address has an account.
       *
       * Detached is not dropped — both outcomes are handled below, so there is
       * no unhandled rejection, and the operator logging survives intact. That
       * logging is the only way to tell a delivery failure from a typo, and
       * going silent to fix the timing would have traded one blindness for
       * another.
       *
       * **The accepted cost:** a redeploy between this line and the send losing
       * one code. *Send another code* is already on screen for that (F7-AC-08).
       */
      void deps
        .sendCode(address)
        .then(({ error }) => {
          if (error) {
            console.warn(`[auth] request-code did not send: ${error.message ?? String(error)}`)
          } else {
            console.log('[auth] request-code accepted by the provider')
          }
        })
        .catch((cause: unknown) => {
          console.warn(`[auth] request-code threw: ${String(cause)}`)
        })
    }

    return c.json(SAME_ANSWER)
  })

  app.post('/api/auth/verify', async (c) => {
    const { email, code } = await c.req
      .json<{ email?: string; code?: string }>()
      .catch(() => ({ email: undefined, code: undefined }))
    if (typeof email !== 'string' || typeof code !== 'string') {
      return c.json({ error: 'invalid_code' }, 400)
    }

    const subject = deps.subjectOf(normaliseAddress(email))

    /**
     * **Before the provider, not after.** F7-AC-09's point is that the sixth
     * attempt is refused without a verification happening at all — an attempt
     * that reaches Supabase is an attempt, and six digits inside a ten-minute
     * window is brute-forceable if they are unbounded.
     *
     * Counted for **every** address, including ones the provider has never heard
     * of. If the counter existed only for real accounts, an unknown address
     * would read `invalid_code` for ever while a known one flipped to
     * `code_spent` — which is the enumeration oracle request-code just closed,
     * walking in through the other door.
     */
    if (await deps.attempts.spent(subject)) {
      return c.json({ error: 'code_spent' }, 400)
    }

    const verified = await deps.verifyCode(email, code)
    if (!verified) {
      await deps.attempts.bump(subject)
      // F7-UP-02: wrong, expired and already-used still read alike here. Only
      // exhaustion is distinguished, and only because it is the one case where
      // retyping the same code can never work.
      return c.json({ error: 'invalid_code' }, 400)
    }

    await deps.attempts.clear(subject)
    const token = await deps.createSession(verified)

    // The account row is created on first sign-in, as the user, so the very
    // first write in the product goes through the policies rather than round
    // them.
    await deps.ensureManagerRow(verified)

    // Derived from the request rather than from env.isProduction — see
    // isSecureRequest for why that distinction cost a production defect.
    const secure = isSecureRequest(c.req.url, c.req.header('X-Forwarded-Proto'))
    c.header('Set-Cookie', cookieHeader(token, secure))
    return c.json({ status: 'signed_in' })
  })

  app.post('/api/auth/logout', async (c) => {
    await deps.endSession(c.req.header('Cookie'))
    c.header(
      'Set-Cookie',
      clearedCookieHeader(isSecureRequest(c.req.url, c.req.header('X-Forwarded-Proto'))),
    )
    return c.json({ status: 'signed_out' })
  })

  app.get('/api/me', async (c) => {
    // authenticate slides the thirty-day window as a side effect, which is
    // F7-AC-10 and is why no route resolves a session by hand.
    const session = await deps.authenticate(c.req.header('Cookie'))
    if (!session) return c.json({ error: 'not_signed_in' }, 401)

    const manager = await deps.readManager(session)
    return c.json({ manager, needsTeamLink: !manager?.fpl_team_id })
  })

  return app
}
