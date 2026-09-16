/**
 * The real collaborators behind the four auth routes.
 *
 * Kept apart from the routes so the routes stay testable with stubs — the shape
 * `world/wire.ts` has used since slice 5, and which auth was the last route
 * factory in this server not to follow.
 *
 * **This is also the only file that touches `SESSION_COOKIE_SECRET`**, on the
 * throttle's behalf. The routes receive `subjectOf` already keyed, so no secret
 * reaches the file that handles requests and none can be logged from there.
 */

import type { Env } from '../env.js'
import { authClient, userClient } from '../supabase.js'
import type { AuthDeps, ManagerRow, VerifiedSession } from './routes.js'
import {
  type AuthenticatedUser,
  authenticateRequest,
  createSession,
  findSession,
  readCookie,
  revoke,
} from './session.js'
import { subjectOf } from './subject.js'
import { pgAttemptStore, pgThrottleStore } from './throttle.pg.js'

export function authDeps(env: Env): AuthDeps {
  return {
    /**
     * `shouldCreateUser: false` is what makes F7-AC-01 true at the API as well
     * as in the dashboard. Public sign-up being off at the provider is a
     * setting; this is the same statement in the code path, so neither alone is
     * the mechanism.
     *
     * Returns rather than throws, because the route deliberately does not await
     * it and a rejected detached promise would be an unhandled rejection.
     */
    async sendCode(email: string) {
      return await authClient()
        .auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
        .then(({ error }) => ({ error }))
        .catch((cause: unknown) => ({ error: cause as { message?: string } }))
    },

    /** Null for wrong, expired and already-used alike — the caller may not tell them apart. */
    async verifyCode(email: string, code: string): Promise<VerifiedSession | null> {
      const { data, error } = await authClient().auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })
      const session = data?.session
      if (error || !session?.user) return null

      return {
        userId: session.user.id,
        refreshToken: session.refresh_token,
        accessToken: session.access_token,
        accessTokenExpiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
      }
    },

    createSession: (s: VerifiedSession) =>
      createSession(s.userId, s.refreshToken, s.accessToken, s.accessTokenExpiresAt),

    async ensureManagerRow(s: VerifiedSession) {
      // As the user, not the service key: the first write in the product goes
      // through the policies rather than round them (ADR 0007).
      await userClient(s.accessToken)
        .from('manager')
        .upsert({ user_id: s.userId }, { onConflict: 'user_id' })
    },

    async endSession(cookie: string | undefined) {
      const token = readCookie(cookie)
      const session = token ? await findSession(token) : null
      if (session) await revoke(session.id)
    },

    authenticate: authenticateRequest,

    async readManager(user: AuthenticatedUser): Promise<ManagerRow | null> {
      const { data } = await userClient(user.accessToken)
        .from('manager')
        .select('user_id, fpl_team_id, team_name, manager_name, overall_rank')
        .maybeSingle()
      return (data as ManagerRow | null) ?? null
    },

    subjectOf: (value: string) => subjectOf(env.sessionCookieSecret, value),

    throttle: pgThrottleStore,
    attempts: pgAttemptStore,
  }
}
