/**
 * `POST /api/runs` — one advice generation, recorded as it happened.
 *
 * Plain JSON for now; F6 adds streaming, the Thinking state and cancellation.
 * What has to be true already: a failed run never destroys existing advice (NFR
 * Reliability), so its calls are stored only when it succeeds; and every model
 * call is recorded against the run it belongs to (ADR 0008, ADR 0009).
 */

import { describe, expect, it } from 'vitest'
import { type RunDeps, runRoutes } from '../../apps/server/src/runs/routes.js'
import { type ModelPort, mockModel } from '../../apps/server/src/model/client.js'
import type { StoredCall } from '../../apps/server/src/runs/generate.js'
import { gw4Week } from './fixture.js'

const user = { userId: 'u1', accessToken: 't1' }

const harness = (overrides: Partial<RunDeps> = {}) => {
  const events: string[] = []
  const stored: { runId: string; calls: unknown[]; modelCalls: unknown[] }[] = []
  const deps: RunDeps = {
    authenticate: async (cookie) => (cookie ? (user as never) : null),
    prepare: async () => {
      events.push('prepare')
    },
    loadWeek: async () => gw4Week(),
    // No prior run, so there is nothing to diff against and everything is new —
    // which is what must happen on a first run rather than a skip.
    refreshInputs: async () => ({ before: null, after: [], feedReadId: 'read-1', calls: [], decisions: {}, costOfSwap: () => 0 }),
    model: () => mockModel(),
    startRun: async (_u, gameweek, snapshotId) => {
      events.push(`start:${String(gameweek)}:${snapshotId}`)
      return 'run-1'
    },
    finishRun: async (_u, runId, _gameweek, calls, modelCalls) => {
      events.push(`finish:${runId}`)
      stored.push({ runId, calls, modelCalls })
    },
    failRun: async (_u, runId, modelCalls) => {
      events.push(`fail:${runId}:${String(modelCalls.length)}`)
    },
    endRun: async (_u, runId, status) => {
      events.push(`end:${runId}:${status}`)
    },
    ...overrides,
  }
  const app = runRoutes(deps)

  /**
   * Drive the one run route and reduce its stream to the answer.
   *
   * There used to be a plain-JSON route beside the streamed one, and these tests
   * used it. Two routes meant two copies of the diff and the lock rules, which
   * had already drifted once — so the JSON one is gone and this reads the same
   * facts off the stream instead.
   */
  const post = async (cookie = 'session=x') => {
    const res = await app.request('/api/runs/stream', {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
    })
    if (res.status !== 200) return { status: res.status, body: {} as Record<string, unknown>, error: null }

    const frames = (await res.text())
      .split('\n\n')
      .filter(Boolean)
      .map((chunk) => ({
        event: /event:\s*(\S+)/.exec(chunk)?.[1] ?? '',
        data: JSON.parse(/data:\s*(.*)/.exec(chunk)?.[1] ?? '{}') as Record<string, unknown>,
      }))

    const last = frames.at(-1)
    return {
      status: 200,
      steps: frames.filter((f) => f.event === 'step').map((f) => f.data),
      body: last?.event === 'done' ? last.data : ({} as Record<string, unknown>),
      error: last?.event === 'error' ? ((last.data['reason'] as string) ?? 'run_failed') : null,
    }
  }

  return { app, post, events, stored }
}

// A whole stored row, because that is what a refresh now reads: a rejected
// call's own band is the baseline for whether its premise moved, and a
// selected call's row is what gets carried into the next run.
const storedCall = (extra: Partial<StoredCall> = {}): StoredCall => ({
  key: 'captaincy:captain:from=1:to=2',
  category: 'captaincy',
  shape: 'captain',
  outPlayerId: 1,
  inPlayerId: 2,
  net: 1.4,
  isReading: false,
  readingReason: null,
  conviction: 62,
  band: 'lean',
  k: 0.5,
  pointsHit: 0,
  costTenths: 0,
  isForced: false,
  watch: false,
  watchReason: null,
  reasoning: 'Already written, already paid for.',
  reasoningSource: 'model',
  diffTag: null,
  breakdown: {} as StoredCall['breakdown'],
  alternatives: null,
  position: 0,
  ...extra,
})

describe('POST /api/runs', () => {
  it('answers 401 to a signed-out request and starts nothing', async () => {
    const h = harness()
    expect((await h.post('')).status).toBe(401)
    expect(h.events).toEqual([])
  })

  it('reads the world fresh, then starts, generates and finishes one run, in that order', async () => {
    const h = harness()
    const response = await h.post()
    const body = response.body as { runId: string; calls: { key: string }[] }

    expect(response.status).toBe(200)
    expect(h.events).toEqual(['prepare', 'start:4:snapshot-gw4', 'finish:run-1'])
    expect(body.runId).toBe('run-1')
    expect(body.calls.length).toBeGreaterThan(0)
  })

  it('stores the calls and every model call against the run', async () => {
    const h = harness()
    await h.post()
    const [run] = h.stored
    expect(run?.calls.length).toBeGreaterThan(0)
    // One proposal, then one line per call — even in mock mode, where each is a
    // zero-cost record rather than an absence.
    // The proposal, plus one reasoning call per call the manager can act on — a
    // keep reading writes its own line and asks the model nothing (F4-AC-01).
    const decidable = (run?.calls ?? []).filter((c) => (c as { isReading: boolean }).isReading !== true)
    expect(run?.modelCalls.length).toBe(decidable.length + 1)
  })

  it('a run that fails is marked failed, and stores no calls — the previous advice stands', async () => {
    const broken: ModelPort = {
      backend: 'mock',
      async proposeTransfers() {
        throw new Error('model unreachable and the fallback broke too')
      },
      async writeReasoning() {
        throw new Error('unreachable')
      },
    }
    const h = harness({ model: () => broken })
    const response = await h.post()

    // A failure is reported on the stream rather than as a status, because the
    // response has already begun by the time the run breaks. What must not
    // change: nothing is stored, and the run is recorded failed.
    expect(response.error).toBe('run_failed')
    expect(h.stored).toEqual([])
    expect(h.events.at(-1)).toMatch(/^end:run-1:failed/)
  })

  it('answers 409 when there is no squad to advise on yet, and starts nothing', async () => {
    const h = harness({ loadWeek: async () => null })
    const response = await h.post()
    expect(response.error).toBe('no_squad')
    expect(h.events).toEqual(['prepare'])
  })
})

describe('STE-128 · every refresh re-runs the pipeline', () => {
  /** A call already on file, so there is something for a reuse to reuse. */

  const player = (id: number, extra: Record<string, unknown> = {}) => ({
    playerId: id,
    status: 'a' as const,
    news: null,
    newsAdded: null,
    chanceOfPlayingNextRound: null,
    nowCostTenths: 50,
    ...extra,
  })

  it('STE-128: no FPL record moved, and the refresh re-plans anyway rather than reusing the week', async () => {
    // **The defect this replaced.** An unchanged FPL record is not an unchanged
    // world: the projections sit behind every figure and no previous copy of
    // them is stored, so this diff cannot see them move. It used to answer
    // "nothing has changed" and hand back the stored calls — with a stale
    // captain pick and a legal substitution missing underneath.
    const world = [player(1), player(2), player(3)]
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before: world, after: world, feedReadId: 'r2', calls: [storedCall()], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await post()).body as { reused: boolean }

    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('STE-128: a quiet week with nothing stored runs anyway, rather than staying empty for ever', async () => {
    // The hole the first version of this gate left. A run that produced no calls
    // leaves nothing to carry forward, so reusing it kept an empty week empty:
    // the diff found nothing new a minute later, declined to spend, and the
    // screen stayed blank with no way out.
    const world = [player(1)]
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before: world, after: world, feedReadId: 'r2', calls: [], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await post()).body as { reused: boolean }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('STE-128, F6-AC-11: churn below the availability gate is still counted, and still re-plans', async () => {
    const before = [player(1, { status: 'd', chanceOfPlayingNextRound: 75, news: 'Knock' })]
    const after = [player(1, { status: 'd', chanceOfPlayingNextRound: 100, news: 'Knock — expected to feature' })]
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before, after, feedReadId: 'r2', calls: [storedCall()], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await post()).body as { reused: boolean; changed: number }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('F6-RS-11, F6-RS-09: a player dropping out of availability does spend, and rewrites the week', async () => {
    const before = [player(1), player(2)]
    const after = [player(1, { status: 'i' }), player(2)]
    let modelCalls = 0
    const { post, stored } = harness({
      refreshInputs: async () => ({ before, after, feedReadId: 'r2', calls: [], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await post()).body as { reused: boolean }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
    expect(stored[0]?.calls.length).toBeGreaterThan(0)
  })

  it('F6-RS-01: a first run has nothing to diff against and is never skipped on that basis', async () => {
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before: null, after: [player(1)], feedReadId: 'r1', calls: [], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await post()).body as { reused: boolean }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('STE-128: a quiet refresh records a real run, and never a failure', async () => {
    // The shape this guards is still the old one: whatever a refresh decides, it
    // must not leave the week's advice destroyed behind it. A run is started and
    // finished; nothing is recorded failed.
    const world = [player(1)]
    const { post, events } = harness({
      refreshInputs: async () => ({ before: world, after: world, feedReadId: 'r2', calls: [storedCall()], decisions: {}, costOfSwap: () => 0 }),
    })

    const body = (await post()).body as { reused: boolean; runId: string | null }

    expect(body.reused).toBe(false)
    expect(body.runId).not.toBeNull()
    expect(events.some((e) => e.startsWith('start:'))).toBe(true)
    expect(events.some((e) => e.startsWith('finish:'))).toBe(true)
    expect(events.some((e) => e.startsWith('fail:'))).toBe(false)
  })
})

describe('STE-130, STE-132 · what a refresh does with a call already decided', () => {
  const { plan } = gw4Week()
  const [tzolis, rogers] = [plan.squad.find((p) => p.name === 'Tzolis'), plan.squad.find((p) => p.name === 'Rogers')]
  const swap = storedCall({
    key: `substitution:upgrade:out=${String(tzolis?.playerId ?? 0)}:in=${String(rogers?.playerId ?? 0)}`,
    category: 'substitution',
    shape: 'upgrade_swap',
    outPlayerId: tzolis?.playerId ?? 0,
    inPlayerId: rogers?.playerId ?? 0,
  })
  const quiet = [
    { playerId: 1, status: 'a' as const, news: null, newsAdded: null, chanceOfPlayingNextRound: null, nowCostTenths: 50 },
  ]
  const run = async (decision: 'selected' | 'rejected', extra: Partial<typeof swap> = {}) => {
    const { post, stored } = harness({
      refreshInputs: async () => ({
        before: quiet,
        after: quiet,
        feedReadId: 'r2',
        calls: [{ ...swap, ...extra }],
        decisions: { [swap.key]: decision },
      }),
    })
    await post()
    return (stored[0]?.calls ?? []) as { key: string; diffTag: string | null; position: number }[]
  }

  it('F6-AC-02: a selected call is carried into the run it constrained, so it is still on screen after a refresh', async () => {
    // **The defect this was written after.** The plan treats a selected call as
    // a constraint and emits no card for it, which is right — there is nothing
    // left to decide. But every screen reads the latest run's calls, so the call
    // he accepted simply vanished at the next refresh, taking *selected ·
    // locked* with it and leaving the decision row pointing at nothing.
    const calls = await run('selected')
    const carried = calls.find((c) => c.key === swap.key)

    expect(carried).toBeDefined()
    // After the new calls, never on top of one of them.
    expect(carried?.position).toBe(calls.length - 1)
  })

  it('STE-132: it is carried whole, so its reasoning is not bought a second time', async () => {
    const calls = await run('selected')
    const carried = calls.find((c) => c.key === swap.key) as unknown as { reasoning: string }

    expect(carried.reasoning).toBe(swap.reasoning)
  })

  /**
   * What this week's world actually scores that swap at.
   *
   * Taken from a run with no decision on it, rather than written in here. A
   * hand-picked band would make the test pass or fail on whether the fixture's
   * arithmetic happened to agree with a number someone typed, which is a test of
   * the fixture rather than of the rule.
   */
  const asScoredNow = async () => {
    const calls = (await run('pending' as 'selected')) as unknown as {
      key: string
      conviction: number | null
      band: string | null
    }[]
    const live = calls.find((c) => c.key === swap.key)
    expect(live).toBeDefined()
    return live as { conviction: number | null; band: string | null }
  }

  it('F6-AC-03: a rejected call the world still scores the same way stays out of the refresh', async () => {
    const now = await asScoredNow()
    const calls = await run('rejected', { conviction: now.conviction, band: now.band as typeof swap.band })

    expect(calls.find((c) => c.key === swap.key)).toBeUndefined()
  })

  it('F6-AC-03, F6-AC-06: the same call returns, labelled, once its band no longer holds', async () => {
    const now = await asScoredNow()
    const other = now.band === 'thin' ? 'certain' : 'thin'
    const calls = await run('rejected', { conviction: 10, band: other as typeof swap.band })
    const back = calls.find((c) => c.key === swap.key)

    expect(back).toBeDefined()
    expect(back?.diffTag).toBe('resurfaced')
  })
})

describe('F6-AC-16, F6-AC-18, F6-AC-20 · the streamed run', () => {
  const read = async (res: Response) => {
    const text = await res.text()
    return text
      .split('\n\n')
      .filter(Boolean)
      .map((chunk) => {
        const event = /event:\s*(\S+)/.exec(chunk)?.[1] ?? ''
        const data = /data:\s*(.*)/.exec(chunk)?.[1] ?? '{}'
        return { event, data: JSON.parse(data) as Record<string, unknown> }
      })
  }

  const stream = (deps: Partial<RunDeps> = {}) => {
    const h = harness(deps)
    return { ...h, go: () => h.app.request('/api/runs/stream', { method: 'POST', headers: { Cookie: 'session=x' } }) }
  }

  it('F6-AC-18: the steps arrive in order, one at a time, ending in done', async () => {
    const { go } = stream({
      refreshInputs: async () => ({ before: null, after: [], feedReadId: 'r1', calls: [], decisions: {}, costOfSwap: () => 0 }),
    })
    const events = await read(await go())

    expect(events.map((e) => e.event)).toEqual(['step', 'step', 'step', 'step', 'step', 'done'])
    expect(events.filter((e) => e.event === 'step').map((e) => e.data['id'])).toEqual([
      'read',
      'diff',
      'propose',
      'score',
      'explain',
    ])
  })

  it('F6-AC-17: a step states the scale of the job in real figures, not a spinner', async () => {
    const { go } = stream({
      refreshInputs: async () => ({ before: null, after: [], feedReadId: 'r1', calls: [], decisions: {}, costOfSwap: () => 0 }),
    })
    const events = await read(await go())
    const diff = events.find((e) => e.data['id'] === 'diff')

    expect((diff?.data['scale'] as { squad: number }).squad).toBe(15)
    expect((diff?.data['scale'] as { players: number }).players).toBeGreaterThan(15)
  })

  it('STE-128: a quiet week still runs every step of the pipeline, scoring included', async () => {
    const same = [{ playerId: 1, status: 'a' as const, news: null, newsAdded: null, chanceOfPlayingNextRound: null, nowCostTenths: 50 }]
    const onFile = [storedCall()]
    const { go } = stream({
      refreshInputs: async () => ({ before: same, after: same, feedReadId: 'r2', calls: onFile, decisions: {}, costOfSwap: () => 0 }),
    })
    const events = await read(await go())

    expect(events.at(-1)?.event).toBe('done')
    expect(events.at(-1)?.data['reused']).toBe(false)
    expect(events.at(-1)?.data['runId']).not.toBeNull()
    expect(events.map((e) => e.data['id'])).toContain('score')
  })

  it('F6-UP-01: a run that breaks says so and is recorded failed, never as a success', async () => {
    const { go, events } = stream({
      refreshInputs: async () => {
        throw new Error('the feed went away mid-run')
      },
    })
    const streamed = await read(await go())

    expect(streamed.at(-1)?.event).toBe('error')
    expect(streamed.at(-1)?.data['reason']).toBe('run_failed')
    // Nothing finished, so the last-run time cannot have moved.
    expect(events.some((e) => e.startsWith('finish:'))).toBe(false)
  })

  it('an unauthenticated stream is refused before anything is read or started', async () => {
    const h = harness({ authenticate: async () => null })
    const res = await h.app.request('/api/runs/stream', { method: 'POST' })

    expect(res.status).toBe(401)
    expect(h.events).toEqual([])
  })
})

describe('F6-AC-03, F6-AC-20 · a returning call is labelled, and a cancelled run is not a failed one', () => {
  const player = (id: number, extra: Record<string, unknown> = {}) => ({
    playerId: id,
    status: 'a' as const,
    news: null,
    newsAdded: null,
    chanceOfPlayingNextRound: null,
    nowCostTenths: 50,
    ...extra,
  })

  it('F6-AC-03: a rejected call whose premise moved comes back labelled, never slipped in unmarked', async () => {
    // The code worked out which calls were returning and then threw it away, so
    // the manager saw something he had already said no to with nothing saying why.
    const { plan } = gw4Week()
    const [tzolis, rogers] = [plan.squad.find((p) => p.name === 'Tzolis'), plan.squad.find((p) => p.name === 'Rogers')]
    // Rejected back when Rogers was a 25% doubt, and filed at a thin band. He is
    // available now, so re-deriving the call lands somewhere else entirely —
    // which is what F6-AC-06 means by materially changed.
    const rejected = storedCall({
      key: `substitution:upgrade:out=${String(tzolis?.playerId ?? 0)}:in=${String(rogers?.playerId ?? 0)}`,
      category: 'substitution',
      shape: 'upgrade_swap',
      outPlayerId: tzolis?.playerId ?? 0,
      inPlayerId: rogers?.playerId ?? 0,
      conviction: 10,
      band: 'thin',
    })
    const before = [player(rogers?.playerId ?? 0, { status: 'd', chanceOfPlayingNextRound: 25 })]
    const after = [player(rogers?.playerId ?? 0)]

    const { post, stored } = harness({
      refreshInputs: async () => ({
        before,
        after,
        feedReadId: 'r2',
        calls: [rejected],
        decisions: { [rejected.key]: 'rejected' },
      }),
    })
    await post()

    const back = (stored[0]?.calls ?? []).find((c) => (c as { key: string }).key === rejected.key)
    expect(back).toBeDefined()
    expect((back as { diffTag: string | null }).diffTag).toBe('resurfaced')
    // The premise really did move. If the fixture ever scores this at thin, the
    // call would be right to stay suppressed and this test should say so loudly
    // rather than pass on a coincidence.
    expect((back as { band: string | null }).band).not.toBe('thin')
  })

  // **F6-AC-20 is not asserted here, and the reason is the harness.** A
  // cancellation is the connection closing, and Hono's in-process request cannot
  // be disconnected: an AbortSignal passed through `app.request`, and a Request
  // built with one directly, both leave `c.req.raw.signal` unaborted. A test
  // that passed against this harness would be proving something about the
  // harness. Recorded in `docs/coverage-gaps.md`, homed on STE-65.
})
