/**
 * `GET /api/world` — the read that has to keep the figures honest.
 *
 * **The behaviour under test never existed before slice 7.** Ingestion ran once,
 * when the world loaded empty, and never again — so outside an advice run the app
 * re-read nothing and every figure on screen was as old as the last run.
 * `CLAUDE.md`'s *feeds are fetched on open* described an intention, not the code.
 */

import { describe, expect, it } from 'vitest'
import { type WorldDeps, worldRoutes } from '../../apps/server/src/world/routes.js'
import type { WorldParts } from '../../apps/server/src/world/assemble.js'

const NOW = Date.parse('2026-09-14T15:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const parts = (): WorldParts => ({
  gameweek: { id: 5, name: 'Gameweek 5', deadlineTime: '2026-09-18T17:30:00Z', isNext: true, isCurrent: false, finished: false, dataChecked: false },
  lastScored: null,
  snapshot: { id: 's1', source: 'fpl_deadline', capturedAt: ago(0), bankTenths: 10, freeTransfers: 1, chipsRemaining: {} },
  squad: [],
  players: [],
  clubs: [],
  fixtures: [],
  projections: [],
  states: [],
})

const harness = (overrides: Partial<WorldDeps> = {}) => {
  const events: string[] = []
  const deps: WorldDeps = {
    authenticate: async (cookie) => (cookie ? ({ userId: 'u1', accessToken: 't1' } as never) : null),
    linkedTeamId: async () => 6131656,
    newestFeedReadAt: async () => ago(0),
    now: () => NOW,
    ingest: async () => {
      events.push('ingest')
      return { gameweek: 5 }
    },
    lastCompletedGameweek: async () => 4,
    captureSquad: async () => {
      events.push('capture')
      return 's1'
    },
    loadParts: async () => parts(),
    ...overrides,
  }
  const app = worldRoutes(deps)
  return { get: () => app.request('/api/world', { headers: { Cookie: 'session=x' } }), events }
}

describe('F6-RS-02 · the feeds are read on open, which is what gives recomputation anything to follow', () => {
  it('a read taken long enough ago is re-fetched, so the world is assembled from what was just read', async () => {
    const { get, events } = harness({ newestFeedReadAt: async () => ago(10 * 60 * 1000) })
    await get()
    expect(events).toContain('ingest')
  })

  it('a first open with nothing on file re-fetches too, rather than answering with an empty world', async () => {
    const { get, events } = harness({ newestFeedReadAt: async () => null })
    await get()
    expect(events.filter((e) => e === 'ingest')).toHaveLength(1)
  })

  it('a burst of reads does not hammer the feeds — a fresh read is reused', async () => {
    // The reload after a decision, or a double-tap. Coalescing bounds how often a
    // user-initiated read reaches the feeds; it starts nothing on a timer, so
    // ADR 0003's no-scheduled-refresh is untouched.
    const { get, events } = harness({ newestFeedReadAt: async () => ago(30 * 1000) })
    await get()
    await get()
    expect(events).not.toContain('ingest')
  })

  it('the squad is still captured when the world has never been loaded', async () => {
    let loaded = 0
    const { get, events } = harness({
      newestFeedReadAt: async () => ago(0),
      loadParts: async () => (loaded++ === 0 ? null : parts()),
    })
    await get()
    expect(events).toContain('capture')
  })

  it('an unauthenticated read fetches nothing at all', async () => {
    const events: string[] = []
    const app = worldRoutes({
      authenticate: async () => null,
      linkedTeamId: async () => 1,
      newestFeedReadAt: async () => null,
      now: () => NOW,
      ingest: async () => {
        events.push('ingest')
        return { gameweek: 5 }
      },
      lastCompletedGameweek: async () => 4,
      captureSquad: async () => 's1',
      loadParts: async () => parts(),
    })
    const res = await app.request('/api/world')

    expect(res.status).toBe(401)
    expect(events).toEqual([])
  })
})
