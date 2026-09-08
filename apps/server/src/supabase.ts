/**
 * The two ways this server talks to Supabase, and the rule that separates them.
 *
 *   User data      -> userClient(accessToken)   — the signed-in user's own token
 *   Reference data -> referenceClient()         — the service key
 *   app_session    -> sessionClient()           — the service key
 *
 * ADR 0007: **user data is read with the signed-in user's token, never the
 * service key.** The service key carries BYPASSRLS, so a server that uses it for
 * user data passes every test asserting the policies exist while providing none
 * of the isolation those policies are for. Nothing on screen would look wrong.
 * That hazard is asserted, not just described, in tests/rls/isolation.test.ts.
 *
 * The two service-key exports are the same client behind different names on
 * purpose. There is no way to make the boundary a compile error while both need
 * the same key, so the next best mechanism is that misuse has to be written down:
 * `referenceClient().from('manager')` reads wrong in a diff in a way that
 * `serviceClient().from('manager')` does not.
 */

import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import type { Env } from './env.js'

const NO_PERSISTENCE = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

let env: Env

export function configureSupabase(loaded: Env): void {
  env = loaded
}

/** Anonymous key, no session. Sending and verifying the six-digit code. */
export function authClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, NO_PERSISTENCE)
}

/**
 * Reads and writes as the signed-in user, so row-level security applies. This is
 * the only client that may touch a table whose posture is `user`.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...NO_PERSISTENCE,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** Service key. Reference tables only — fixtures, projections, the feed cache. */
export function referenceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, NO_PERSISTENCE)
}

/** Service key. `app_session` only, which is unreachable as anon or authenticated. */
export function sessionClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, NO_PERSISTENCE)
}
