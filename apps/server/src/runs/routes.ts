/**
 * `POST /api/runs` — one advice generation.
 *
 * Plain JSON for now. F6 (slice 7) turns this into the streamed, cancellable run
 * behind the Thinking state; the steps inside it do not change.
 *
 * **A failed run never destroys existing advice** (NFR Reliability). Its calls
 * are stored only once it has succeeded, and every screen reads the latest
 * *succeeded* run — so a run that breaks halfway leaves the week exactly as it
 * was, with the failure on its own row.
 *
 * Collaborators are injected, so the route is testable without a network, a
 * database or a model.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'
import type { PlanInput } from '../calls/plan.js'
import type { ModelCallRecord, ModelPort } from '../model/client.js'
import { type CardInfo, type StoredCall, generateWeek } from './generate.js'

export type WeekInputs = {
  gameweek: number
  snapshotId: string
  plan: PlanInput
  cards: Map<number, CardInfo>
}

export type RunDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** Read both feeds fresh and fill any purchase price the squad is missing. */
  prepare: (user: AuthenticatedUser) => Promise<void>
  loadWeek: (user: AuthenticatedUser) => Promise<WeekInputs | null>
  model: () => ModelPort
  startRun: (user: AuthenticatedUser, gameweek: number, snapshotId: string) => Promise<string>
  finishRun: (
    user: AuthenticatedUser,
    runId: string,
    gameweek: number,
    calls: StoredCall[],
    modelCalls: ModelCallRecord[],
  ) => Promise<void>
  failRun: (user: AuthenticatedUser, runId: string, modelCalls: ModelCallRecord[]) => Promise<void>
}

export function runRoutes(deps: RunDeps) {
  const app = new Hono()

  app.post('/api/runs', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    await deps.prepare(user)

    const week = await deps.loadWeek(user)
    if (!week) return c.json({ error: 'no_squad' }, 409)

    const runId = await deps.startRun(user, week.gameweek, week.snapshotId)

    try {
      const { calls, modelCalls } = await generateWeek({ plan: week.plan, cards: week.cards, model: deps.model() })
      await deps.finishRun(user, runId, week.gameweek, calls, modelCalls)
      return c.json({ runId, calls })
    } catch (cause) {
      console.error(`[runs] run ${runId} failed`, cause)
      await deps.failRun(user, runId, [])
      return c.json({ error: 'run_failed' }, 500)
    }
  })

  return app
}
