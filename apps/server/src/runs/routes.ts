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
import { streamSSE } from 'hono/streaming'
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
  /** Close a streamed run that did not finish. Cancelled is not failed (F6-AC-20). */
  endRun: (user: AuthenticatedUser, runId: string, status: 'failed' | 'cancelled') => Promise<void>
}

/**
 * The steps the Thinking state names, in the order they run (F6-AC-18).
 *
 * Stated here rather than in the client so that the label and the state can
 * never contradict each other: the screen renders what the server says it is
 * doing, and has no second opinion about what happens next.
 */
export const RUN_STEPS = [
  { id: 'read', label: 'Reading the feeds' },
  { id: 'diff', label: 'Checking what has changed' },
  { id: 'propose', label: 'Looking for candidates' },
  { id: 'score', label: 'Scoring the week' },
  { id: 'explain', label: 'Writing the reasoning' },
] as const

export function runRoutes(deps: RunDeps) {
  const app = new Hono()

  /**
   * The streamed form (F6-AC-16 to F6-AC-20). Same steps, different transport —
   * the Thinking state needs to know what is happening *while* it happens, and a
   * request that completes in one lump cannot say.
   *
   * **Cancellation is the request closing.** The client aborts, this loop's
   * writes start failing, and the run is marked `cancelled` — which is treated
   * exactly as a run that never started, never as a failure, so the last-run
   * time does not move (F6-AC-20).
   */
  app.post('/api/runs/stream', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    return streamSSE(c, async (stream) => {
      let runId: string | null = null
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) })

      try {
        await send('step', { id: 'read', label: RUN_STEPS[0].label })
        await deps.prepare(user)

        const week = await deps.loadWeek(user)
        if (!week) {
          await send('error', { reason: 'no_squad' })
          return
        }

        // Real figures, never a spinner's worth of words (F6-AC-17). Carried on
        // every step from here, so the screen states the scale of the job from
        // the first moment it can rather than a beat later.
        const scale = { players: week.plan.squad.length + week.plan.pool.length, squad: week.plan.squad.length }
        await send('step', { id: 'diff', label: RUN_STEPS[1].label, scale })
        const refresh = await deps.refreshInputs(user)
        const evidence = refresh.before === null ? null : diffEvidence(refresh.before, refresh.after)

        // See the note on the JSON route: a reuse writes no run at all. A
        // succeeded run with no calls does not reuse the week's advice, it
        // replaces it with nothing.
        if (evidence && !evidence.worthPaying && refresh.calls.length > 0) {
          await send('done', { runId: null, calls: [], reused: true, changed: evidence.changed.length })
          return
        }

        runId = await deps.startRun(user, week.gameweek, week.snapshotId, refresh.feedReadId)

        await send('step', { id: 'propose', label: RUN_STEPS[2].label, scale })
        const changedPlayers = new Set((evidence?.changed ?? []).map((ch) => ch.playerId))
        const { keys } = suppressed(refresh.calls, refresh.decisions, changedPlayers)

        await send('step', { id: 'score', label: RUN_STEPS[3].label, scale })
        const { calls, modelCalls } = await generateWeek({
          plan: {
            ...week.plan,
            committed: committedPairs(refresh.calls, refresh.decisions, refresh.costOfSwap),
            suppressed: keys,
          },
          cards: week.cards,
          model: deps.model(),
        })

        await send('step', { id: 'explain', label: RUN_STEPS[4].label, scale, calls: calls.length })
        await deps.finishRun(user, runId, week.gameweek, calls, modelCalls)
        await send('done', { runId, calls, reused: false })
      } catch (cause) {
        // A closed request is a cancellation, not a failure, and the two must
        // never be recorded as the same thing — a failure ages nothing either,
        // but it is something the manager is shown and asked about (F6-UP-01).
        const cancelled = c.req.raw.signal.aborted
        console.error(`[runs] streamed run ${runId ?? 'unstarted'} ${cancelled ? 'cancelled' : 'failed'}`, cause)
        if (runId) await deps.endRun(user, runId, cancelled ? 'cancelled' : 'failed')
        if (!cancelled) await send('error', { reason: 'run_failed', runId })
      }
    })
  })

  app.post('/api/runs', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    await deps.prepare(user)

    const week = await deps.loadWeek(user)
    if (!week) return c.json({ error: 'no_squad' }, 409)

    const refresh = await deps.refreshInputs(user)
    const evidence = refresh.before === null ? null : diffEvidence(refresh.before, refresh.after)

    // **F6-RS-08, and the run row is not written at all.** Nothing has moved that
    // could alter a decision, so the model is not called and *the stored calls
    // are reused* — which is the criterion's own word.
    //
    // Writing a succeeded run with no calls instead does not reuse them, it
    // destroys them: every screen reads the latest succeeded run, so the week's
    // advice vanished and read as "nothing worth doing" rather than as a
    // failure. Found live on 2026-09-14, after a refresh that correctly found
    // nothing to do emptied the Assistant.
    //
    // Nothing advancing is also right for the next diff: its baseline stays the
    // read the advice on screen was actually built from.
    // **And there has to be something to reuse.** A run that produced no calls
    // leaves nothing to carry forward, so reusing it would keep an empty week
    // empty for ever: the diff finds nothing new a minute later, declines to
    // spend, and the screen stays blank with no way out. Found live on
    // 2026-09-14, after the empty runs the bug above had already written.
    //
    // Zero stored calls cannot be a legitimate quiet week either — captaincy
    // produces two calls every week without exception (F4-AC-01) — so zero means
    // something went wrong, not that there is nothing to say.
    if (evidence && !evidence.worthPaying && refresh.calls.length > 0) {
      return c.json({ runId: null, calls: [], reused: true, changed: evidence.changed.length })
    }

    const runId = await deps.startRun(user, week.gameweek, week.snapshotId, refresh.feedReadId)

    try {

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
