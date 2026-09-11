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
    ...overrides,
  }
  const app = runRoutes(deps)
  const post = (cookie = 'session=x') =>
    app.request('/api/runs', { method: 'POST', headers: cookie ? { Cookie: cookie } : {} })
  return { post, events, stored }
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
    expect(run?.modelCalls.length).toBe((run?.calls.length ?? 0) + 1)
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
