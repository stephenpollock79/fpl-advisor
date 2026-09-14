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
  const post = (cookie = 'session=x') =>
    app.request('/api/runs', { method: 'POST', headers: cookie ? { Cookie: cookie } : {} })
  return { app, post, events, stored }
}

describe('POST /api/runs', () => {
  it('answers 401 to a signed-out request and starts nothing', async () => {
    const h = harness()
    expect((await h.post('')).status).toBe(401)
    expect(h.events).toEqual([])
  })

  it('reads the world fresh, then starts, generates and finishes one run, in that order', async () => {
    const h = harness()
    const response = await h.post()
    const body = (await response.json()) as { runId: string; calls: { key: string }[] }

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

    expect(response.status).toBe(500)
    expect(h.stored).toEqual([])
    expect(h.events.at(-1)).toMatch(/^fail:run-1/)
  })

  it('answers 409 when there is no squad to advise on yet, and starts nothing', async () => {
    const h = harness({ loadWeek: async () => null })
    const response = await h.post()
    expect(response.status).toBe(409)
    expect(h.events).toEqual(['prepare'])
  })
})

describe('F6-RS-08 · most refreshes should cost nothing', () => {
  /** A call already on file, so there is something for a reuse to reuse. */
  const stored = () => ({
    key: 'captaincy:captain:from=1:to=2',
    category: 'captaincy' as const,
    outPlayerId: 1,
    inPlayerId: 2,
    costTenths: 0,
    alternatives: null,
  })

  const player = (id: number, extra: Record<string, unknown> = {}) => ({
    playerId: id,
    status: 'a' as const,
    news: null,
    newsAdded: null,
    chanceOfPlayingNextRound: null,
    nowCostTenths: 50,
    ...extra,
  })

  it('F6-RS-08: nothing has moved, so the model is not called at all and the week stands', async () => {
    const world = [player(1), player(2), player(3)]
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before: world, after: world, feedReadId: 'r2', calls: [stored()], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const res = await post()
    const body = (await res.json()) as { reused: boolean }

    expect(body.reused).toBe(true)
    expect(modelCalls).toBe(0)
  })

  it('F6-RS-08: a quiet week with nothing stored to reuse runs anyway, rather than staying empty for ever', async () => {
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

    const body = (await (await post()).json()) as { reused: boolean }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('F6-RS-08: ordinary churn in the news field is not worth paying for either', async () => {
    const before = [player(1, { status: 'd', chanceOfPlayingNextRound: 75, news: 'Knock' })]
    const after = [player(1, { status: 'd', chanceOfPlayingNextRound: 100, news: 'Knock — expected to feature' })]
    let modelCalls = 0
    const { post } = harness({
      refreshInputs: async () => ({ before, after, feedReadId: 'r2', calls: [stored()], decisions: {}, costOfSwap: () => 0 }),
      model: () => {
        modelCalls += 1
        return mockModel()
      },
    })

    const body = (await (await post()).json()) as { reused: boolean; changed: number }
    expect(body.reused).toBe(true)
    // It was seen and counted — silence is not the same as blindness.
    expect(body.changed).toBe(1)
    expect(modelCalls).toBe(0)
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

    const body = (await (await post()).json()) as { reused: boolean }
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

    const body = (await (await post()).json()) as { reused: boolean }
    expect(body.reused).toBe(false)
    expect(modelCalls).toBe(1)
  })

  it('F6-RS-08: a reused refresh writes no run at all, so the week it reused is still there', async () => {
    // **The bug this was written after.** A reuse used to write a succeeded run
    // with no calls, and every screen reads the latest succeeded run — so the
    // week's advice vanished and read as "nothing worth doing" rather than as
    // anything having gone wrong. Reuse means reuse.
    const world = [player(1)]
    const { post, events } = harness({
      refreshInputs: async () => ({ before: world, after: world, feedReadId: 'r2', calls: [stored()], decisions: {}, costOfSwap: () => 0 }),
    })

    const body = (await (await post()).json()) as { reused: boolean; runId: string | null }

    expect(body.reused).toBe(true)
    expect(body.runId).toBeNull()
    expect(events.some((e) => e.startsWith('start:'))).toBe(false)
    expect(events.some((e) => e.startsWith('finish:'))).toBe(false)
    expect(events.some((e) => e.startsWith('fail:'))).toBe(false)
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

  it('F6-RS-08: a quiet week streams straight to done, reused, with no scoring steps', async () => {
    const same = [{ playerId: 1, status: 'a' as const, news: null, newsAdded: null, chanceOfPlayingNextRound: null, nowCostTenths: 50 }]
    const onFile = [{ key: 'captaincy:captain:from=1:to=2', category: 'captaincy' as const, outPlayerId: 1, inPlayerId: 2, costTenths: 0, alternatives: null }]
    const { go } = stream({
      refreshInputs: async () => ({ before: same, after: same, feedReadId: 'r2', calls: onFile, decisions: {}, costOfSwap: () => 0 }),
    })
    const events = await read(await go())

    expect(events.at(-1)?.event).toBe('done')
    expect(events.at(-1)?.data['reused']).toBe(true)
    expect(events.at(-1)?.data['runId']).toBeNull()
    expect(events.map((e) => e.data['id'])).not.toContain('score')
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
