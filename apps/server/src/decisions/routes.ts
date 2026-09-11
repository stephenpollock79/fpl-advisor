/**
 * `POST /api/decisions` — the manager's answer to one call.
 *
 * Three states and one route (F3-AC-01): *selected* and *rejected* are stored
 * against the call's key for the gameweek being advised on; *pending* is the
 * absence of a row, so asking for it deletes one (F3-AC-14). Decisions belong to
 * the key, never to a call row and never to a category (F3-AC-02) — the call row
 * is rewritten by every run, and the key is what survives it (architecture §5).
 *
 * Collaborators are injected, so the route is testable without a database.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'

export type DecisionState = 'selected' | 'rejected'

export type DecisionDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** The gameweek being advised on — `is_next`, never `is_current`. */
  gameweek: () => Promise<number>
  record: (user: AuthenticatedUser, gameweek: number, callKey: string, state: DecisionState) => Promise<void>
  clear: (user: AuthenticatedUser, gameweek: number, callKey: string) => Promise<void>
}

const STATES = new Set(['selected', 'rejected', 'pending'])

/** Longer than any key the engine builds; a guard against junk, not a format check. */
const MAX_KEY_LENGTH = 200

export function decisionRoutes(deps: DecisionDeps) {
  const app = new Hono()

  app.post('/api/decisions', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const callKey = body?.['callKey']
    const state = body?.['state']

    if (typeof callKey !== 'string' || callKey.length === 0 || callKey.length > MAX_KEY_LENGTH) {
      return c.json({ error: 'bad_call_key' }, 400)
    }
    if (typeof state !== 'string' || !STATES.has(state)) {
      return c.json({ error: 'bad_state' }, 400)
    }

    const gameweek = await deps.gameweek()

    if (state === 'pending') {
      await deps.clear(user, gameweek, callKey)
    } else {
      await deps.record(user, gameweek, callKey, state as DecisionState)
    }

    return c.json({ callKey, state })
  })

  return app
}
