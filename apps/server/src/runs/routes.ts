/**
 * `POST /api/runs/stream` — one advice generation, or the decision not to make
 * one, reported as it happens.
 *
 * **One route, not two.** A plain-JSON version ran beside this until
 * 2026-09-14, used by the first run of a gameweek, with the diff and the lock
 * logic written out twice. Two copies of a rule drift, and this pair already
 * had: the fix for a reuse writing an empty run had to be made in both, and
 * missing one would have shown up only on a first run. The first run is also the
 * longest, so it is the moment a progress pipeline is worth most — and it was
 * the one place that did not have one.
 *
 * **Most refreshes should cost nothing** (F6-RS-08). The diff runs first and is
 * mechanical and free; only when it finds something that could change a decision
 * is the model called at all. When it finds nothing the stored calls are reused
 * and the figures are *identical* rather than close, because every one of them
 * is arithmetic over published inputs that have not moved.
 *
 * **That gate was removed on 2026-09-14 and restored the same night** (STE-128),
 * and what changed in between is the only thing that made it trustworthy. It
 * used to ask one question — have FPL's player records moved? — and a call rests
 * mostly on the projections, which are stored one row per player and overwritten
 * on every ingest. So it reported *nothing has changed* while the numbers under
 * the advice had been republished, which is the worse of the two silences
 * because it reads as the reassuring one.
 *
 * It now also re-derives every stored call from the read just taken and asks
 * whether any figure no longer holds. No projection history is needed for that:
 * each call carries the figure it was made at, and a projection that moves shows
 * up as a figure that moves. The residual — a brand-new candidate becoming worth
 * proposing on a projection alone — is named at the gate itself.
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
import { transferCostTenths } from '@fpl/engine'
import type { EvidenceRow } from '../refresh/evidence.js'
import { diffEvidence } from '../refresh/evidence.js'
import type { DecisionState } from '../refresh/locks.js'
import { committedPairs, suppressed } from '../refresh/locks.js'
import type { SideNow } from '../refresh/recompute.js'
import { recomputeCall } from '../refresh/recompute.js'
import { identityOf } from '../calls/identity.js'
import { RETIRED_SHAPES } from '../calls/plan.js'
import { type CardInfo, type StoredCall, composeEditorial, generateWeek } from './generate.js'

export type WeekInputs = {
  gameweek: number
  snapshotId: string
  /** Where this week's squad came from, for the editorial (F8-AC-04). */
  squadSource: 'deadline' | 'screenshot'
  plan: PlanInput
  cards: Map<number, CardInfo>
}

/** What the last successful run saw, and what the feeds say now. */
export type RefreshInputs = {
  /** Null when there has never been a successful run — then everything is new. */
  before: EvidenceRow[] | null
  after: EvidenceRow[]
  feedReadId: string | null
  /**
   * The calls that run produced, whole, and the manager's answers to them.
   *
   * **Stored rather than lockable.** A `LockableCall` — the pair, the cost and
   * the picker's alternatives — is enough to resolve a lock and nothing else.
   * Deciding whether a rejected call's premise has moved needs the figure it was
   * rejected at, and carrying a selected call into the next run needs the row
   * entire. A `StoredCall` satisfies `LockableCall` structurally, so the lock
   * code is unchanged.
   */
  calls: StoredCall[]
  decisions: Record<string, DecisionState>
  /**
   * **The squad that run was built on.** Null where there has never been a
   * successful run — and null means everything is new, the safe direction.
   */
  fromSnapshotId: string | null
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
    /** The week in one read, written by this run (F8-AC-08). */
    editorial: string,
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


/**
 * What a swapped transfer actually costs (F3-AC-24, F3-AC-25).
 *
 * **It used to cost nothing.** A decision filed against a swapped pair was
 * committed at zero, so the next run believed the bank untouched and could
 * recommend a second transfer the manager could not afford — removing the one
 * hard constraint money has in this build.
 *
 * Built from the week's own prices: the incoming player's price now, and FPL's
 * selling price for the outgoing one. A player whose selling price could not be
 * recovered is not offered for sale at all, so zero here is unreachable rather
 * than a fallback.
 */
const swapCost = (plan: WeekInputs['plan']) => {
  const priceOf = new Map([...plan.squad, ...plan.pool].map((p) => [p.playerId, p.nowCostTenths]))
  const sellingOf = new Map(plan.squad.map((p) => [p.playerId, p.sellingPriceTenths]))
  return (outId: number, inId: number): number =>
    transferCostTenths(priceOf.get(inId) ?? 0, sellingOf.get(outId) ?? 0)
}

/**
 * Which stored calls are no longer the call they were (F6-AC-06).
 *
 * The verdict is the engine's, re-derived from the world as it stands: the band
 * crossed a boundary, or the call can no longer be executed. Nothing here
 * judges; `recomputeCall` already owns both limbs and already runs on every
 * world read.
 *
 * **The baseline is each call's own stored figure**, which is the whole reason
 * any of this can be answered without a projection history. A projection that
 * moves shows up here through its effect on the calls it supports.
 *
 * Two things read this, and both want the same question answered. A rejected
 * call returns when its own entry is here (F6-AC-03). And the run is worth
 * paying for when *anything* is here, because a figure that moved is a published
 * input that moved (F6-RS-08).
 *
 * **A call that cannot be re-derived counts as moved.** That is the safe
 * direction in both readings: the run spends rather than reusing on a verdict it
 * could not reach, and a rejected call comes back visible rather than being held
 * out by a failure nobody sees.
 */
function materiallyMoved(refresh: RefreshInputs, week: WeekInputs): Set<string> {
  const sides = new Map<number, SideNow>(
    [
      ...week.plan.squad.map((p) => [p, true] as const),
      ...week.plan.pool.map((p) => [p, false] as const),
    ].map(([p, inSquad]) => [
      p.playerId,
      {
        playerId: p.playerId,
        projections: p.projections,
        availability: p.availability,
        hasFixture: p.hasFixture,
        inSquad,
        priceTenths: p.nowCostTenths,
        sellingPriceTenths: inSquad ? ((p as WeekInputs['plan']['squad'][number]).sellingPriceTenths ?? null) : null,
      },
    ]),
  )

  // The same derivation `plan.ts` and the world read both make: a vice armband
  // cannot stay on the player a captain call is moving the armband onto
  // (STE-144).
  const captainCall = refresh.calls.find((c) => identityOf(c).type === 'captain' && !c.isReading)
  const wouldCaptain = captainCall?.inPlayerId ?? null

  const moved = new Set<string>()
  for (const call of refresh.calls) {
    /**
     * **A shape the planner no longer writes cannot be reused.** Its figures may
     * re-derive perfectly and still describe a card this build does not produce;
     * only a run can replace it. Checked before the recompute, because the
     * question is not whether the world moved.
     */
    if (RETIRED_SHAPES.has(call.shape)) {
      moved.add(call.key)
      continue
    }
    // One bad row must not take down the run — the same posture the world read
    // takes, and for the same reason: a call naming a player the latest feed no
    // longer knows is one call's problem, not the week's.
    try {
      const now = recomputeCall(
        {
          ...call,
          identity: identityOf(call),
          cannotHoldRole: identityOf(call).type === 'vice' && wouldCaptain === call.outPlayerId,
        },
        sides,
      )
      if (now.movedBand || now.unexecutable) moved.add(call.key)
    } catch (cause) {
      console.error(`[runs] could not re-derive ${call.key}; treating it as moved`, cause)
      moved.add(call.key)
    }
  }
  return moved
}

/**
 * The decided calls this run must carry, so they are still on screen after it.
 *
 * Selected only. A rejected call is absent by design and a pending one was never
 * a decision. Positions continue after the new calls rather than keeping their
 * old ones, which would collide.
 *
 * Carried **whole**: the stored reasoning, breakdown and alternatives come
 * across untouched. The figures are deliberately not refreshed here — the world
 * read re-derives every stored call as it loads and reports a band move itself,
 * so refreshing them a second time here would be a second copy of that rule.
 */
function carriedForward(refresh: RefreshInputs, from: number): StoredCall[] {
  return refresh.calls
    .filter((call) => refresh.decisions[call.key] === 'selected')
    .map((call, i) => ({ ...call, position: from + i }))
}

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
      let closed = false
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) })

      /**
       * **The abort has to be listened for, not waited for.**
       *
       * Cancelling is the connection closing, and the work in flight does not
       * notice: a model call that never returns never throws, so nothing reached
       * the catch below and the run sat at *running* for ever. The manager saw a
       * cancel that worked and the record said otherwise (F6-AC-20).
       */
      c.req.raw.signal.addEventListener('abort', () => {
        closed = true
        if (runId) void deps.endRun(user, runId, 'cancelled')
      })

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
        const moved = materiallyMoved(refresh, week)

        /**
         * **Most refreshes should cost nothing** (F6-RS-08), and this is the
         * check that decides — now that it can answer honestly.
         *
         * Both halves are free. `diffEvidence` compares FPL's own player records;
         * `materiallyMoved` re-derives every stored call from the feed read just
         * taken and reports the ones whose figure no longer holds. Neither calls
         * the model. Only when both find nothing is the week reused.
         *
         * **The second half is what was missing, and its absence made this gate
         * a liar.** A call rests mostly on the projections, and those are stored
         * one row per player and overwritten on every ingest, so nothing here
         * could see them move — the gate reported *nothing has changed* while
         * the numbers underneath had been republished. It does not need a
         * projection history to see that: every stored call carries the figure
         * it was made at, and a projection that moves shows up as a figure that
         * moved.
         *
         * **What it still cannot see** is a brand-new candidate becoming worth
         * proposing on a projection alone, with no injury, news or price behind
         * it — there is no existing call for that to move. The FPL-record half
         * catches the injuries and returns that produce most new candidates
         * (F6-RS-05), so the two together are a good net rather than a complete
         * one. Stated rather than glossed.
         *
         * A reuse writes no run at all: a succeeded run with no calls does not
         * reuse the week's advice, it replaces it with nothing.
         */
        /**
         * **A new squad is new evidence, and the gate could not see it**
         * (found live 2026-09-16, STE-141; `F6-RS-06`).
         *
         * Both halves above look at the *feed*: FPL's player records, and the
         * figures each stored call was made at. **Neither notices that the
         * squad underneath every one of those calls has been replaced.** So an
         * upload landed, nothing in the feed had moved, the week was reused —
         * and reuse writes no run at all. The last-run time stayed at the
         * morning's run, and the morning's calls stayed on screen, one of them
         * offering to buy a player the new squad already held.
         *
         * The snapshot the last run was built on is recorded on the run row and
         * was simply never read back. Comparing it is free and exact: a
         * correction, a gameweek rollover, any re-capture at all produces a new
         * snapshot id, and none of them may be answered with last week's advice.
         */
        const sameSquad = refresh.fromSnapshotId === week.snapshotId

        if (sameSquad && evidence && !evidence.worthPaying && moved.size === 0 && refresh.calls.length > 0) {
          await send('done', { runId: null, calls: [], reused: true, changed: evidence.changed.length })
          return
        }

        runId = await deps.startRun(user, week.gameweek, week.snapshotId, refresh.feedReadId)
        // The connection may have closed while the feeds were being read, before
        // there was a run to mark. Caught here as well as in the listener, so a
        // cancel lands wherever it arrives.
        if (closed) {
          await deps.endRun(user, runId, 'cancelled')
          return
        }

        await send('step', { id: 'propose', label: RUN_STEPS[2].label, scale })
        // Whether a rejected call's premise has moved is answered by the call's
        // own stored band against the world as it stands (F6-AC-06) — not by the
        // FPL-record diff, which cannot see the projections move at all.
        const { keys, returning } = suppressed(refresh.calls, refresh.decisions, moved)

        // **One port for the whole run.** Two calls to `deps.model()` would
        // resolve the route twice and record the run as having chosen its
        // backend more than once, for no gain.
        const model = deps.model()

        await send('step', { id: 'score', label: RUN_STEPS[3].label, scale })
        const { calls, modelCalls, blankWeek } = await generateWeek({
          resurfaced: returning,
          plan: {
            ...week.plan,
            committed: committedPairs(refresh.calls, refresh.decisions, swapCost(week.plan)),
            suppressed: keys,
          },
          cards: week.cards,
          model,
        })

        // **A decided call is carried into the run it constrained** (F6-AC-02).
        // The plan treats a selected call as a constraint and emits no card for
        // it, which is right — there is nothing left to decide. But every screen
        // reads the latest run's calls, so a call absent from this one simply
        // vanishes, taking *selected · locked* with it and leaving the decision
        // row pointing at nothing. Carried whole: its reasoning is already
        // bought and must not be bought again.
        const withCarried = [...calls, ...carriedForward(refresh, calls.length)]

        // **Written last, over the whole week.** A carried call is one the
        // manager already selected, and an editorial that counted only what this
        // run planned said "3 calls this week" above a screen showing six
        // (found 2026-09-15). One list, as F8-AC-06 requires.
        const named: Map<number, string> = new Map(
          [...week.cards].map(([id, card]: [number, CardInfo]) => [id, card.name] as const),
        )
        const editorial = await composeEditorial({
          model,
          calls: withCarried,
          nameOf: (id) => named.get(id) ?? 'A player',
          context: {
            exception: blankWeek ? 'blank' : null,
            // **Read from the snapshot, not assumed.** Slice 8 hardcoded this
            // because there was only one source; F2 makes the second real, and
            // slice 8's own review named the hardcoding as the gap.
            squadSource: week.squadSource,
          },
        })
        if (editorial.record) modelCalls.push(editorial.record)

        await send('step', { id: 'explain', label: RUN_STEPS[4].label, scale, calls: withCarried.length })
        await deps.finishRun(user, runId, week.gameweek, withCarried, modelCalls, editorial.text)
        await send('done', { runId, calls: withCarried, reused: false })
      } catch (cause) {
        // A closed request is a cancellation, not a failure, and the two must
        // never be recorded as the same thing — a failure ages nothing either,
        // but it is something the manager is shown and asked about (F6-UP-01).
        const cancelled = closed || c.req.raw.signal.aborted
        console.error(`[runs] streamed run ${runId ?? 'unstarted'} ${cancelled ? 'cancelled' : 'failed'}`, cause)
        if (runId) await deps.endRun(user, runId, cancelled ? 'cancelled' : 'failed')
        if (!cancelled) await send('error', { reason: 'run_failed', runId })
      }
    })
  })

  return app
}
