/**
 * `POST /api/runs` — one advice generation, or the decision not to make one.
 *
 * **Most refreshes should cost nothing** (F6-RS-08). The diff runs first and is
 * mechanical and free; only when it finds something that could change a decision
 * is the model called at all. When it finds nothing the stored calls are reused
 * and the figures are *identical* rather than close, because every one of them is
 * arithmetic over published inputs that have not moved.
 *
 * The manager's own decisions go in as constraints (F6-AC-01) and suppressions
 * (F6-AC-03) rather than being applied to the output afterwards — a plan built
 * around them cannot contradict them, and a plan filtered after the fact can.
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
import type { EvidenceRow } from '../refresh/evidence.js'
import { diffEvidence } from '../refresh/evidence.js'
import type { DecisionState, LockableCall } from '../refresh/locks.js'
import { committedPairs, suppressed } from '../refresh/locks.js'
import { type CardInfo, type StoredCall, generateWeek } from './generate.js'

export type WeekInputs = {
  gameweek: number
  snapshotId: string
  plan: PlanInput
  cards: Map<number, CardInfo>
}

/** What the last successful run saw, and what the feeds say now. */
export type RefreshInputs = {
  /** Null when there has never been a successful run — then everything is new. */
  before: EvidenceRow[] | null
  after: EvidenceRow[]
  feedReadId: string | null
  /** The calls that run produced, and the manager's answers to them. */
  calls: LockableCall[]
  decisions: Record<string, DecisionState>
  costOfSwap: (outId: number, inId: number) => number
}

export type RunDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** Read both feeds fresh and fill any purchase price the squad is missing. */
  prepare: (user: AuthenticatedUser) => Promise<void>
  loadWeek: (user: AuthenticatedUser) => Promise<WeekInputs | null>
  refreshInputs: (user: AuthenticatedUser) => Promise<RefreshInputs>
  model: () => ModelPort
  startRun: (user: AuthenticatedUser, gameweek: number, snapshotId: string, feedReadId: string | null) => Promise<string>
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

    const refresh = await deps.refreshInputs(user)
    const evidence = refresh.before === null ? null : diffEvidence(refresh.before, refresh.after)

    const runId = await deps.startRun(user, week.gameweek, week.snapshotId, refresh.feedReadId)

    try {
      // F6-RS-08. Nothing has moved that could alter a decision, so the model is
      // not called at all and the week stands as it was. The figures are kept
      // honest by the recomputation on every world read, not by spending here.
      if (evidence && !evidence.worthPaying) {
        await deps.finishRun(user, runId, week.gameweek, [], [])
        return c.json({ runId, calls: [], reused: true, changed: evidence.changed.length })
      }

      const changedPlayers = new Set((evidence?.changed ?? []).map((ch) => ch.playerId))
      const { keys } = suppressed(refresh.calls, refresh.decisions, changedPlayers)

      const { calls, modelCalls } = await generateWeek({
        plan: {
          ...week.plan,
          committed: committedPairs(refresh.calls, refresh.decisions, refresh.costOfSwap),
          suppressed: keys,
        },
        cards: week.cards,
        model: deps.model(),
      })
      await deps.finishRun(user, runId, week.gameweek, calls, modelCalls)
      return c.json({ runId, calls, reused: false })
    } catch (cause) {
      console.error(`[runs] run ${runId} failed`, cause)
      await deps.failRun(user, runId, [])
      return c.json({ error: 'run_failed' }, 500)
    }
  })

  return app
}
