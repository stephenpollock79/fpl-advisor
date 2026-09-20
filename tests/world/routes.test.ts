/**
 * `GET /api/world` — the read that has to keep the figures honest.
 *
 * **The behaviour under test never existed before slice 7.** Ingestion ran once,
 * when the world loaded empty, and never again — so outside an advice run the app
 * re-read nothing and every figure on screen was as old as the last run.
 * `CLAUDE.md`'s *feeds are fetched on open* described an intention, not the code.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type WorldDeps, worldRoutes } from '../../apps/server/src/world/routes.js'
import type { WorldParts } from '../../apps/server/src/world/assemble.js'

const NOW = Date.parse('2026-09-14T15:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const parts = (picksFrom: number | null = 4): WorldParts => ({
  picksFrom,
  gameweek: { id: 5, name: 'Gameweek 5', deadlineTime: '2026-09-18T17:30:00Z', isNext: true, isCurrent: false, finished: false, dataChecked: false },
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
    // No successful run in these fixtures, so the token has no baseline and
    // stays silent — which is what the first open must do (F8-AC-19).
    newsInputs: async () => ({ before: null, after: [], since: null }),
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
    supersedeSnapshot: async () => {
      events.push('supersede')
    },
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
      supersedeSnapshot: async () => undefined,
      authenticate: async () => null,
      linkedTeamId: async () => 1,
      newestFeedReadAt: async () => null,
      newsInputs: async () => ({ before: null, after: [], since: null }),
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


describe('F6-UP-03 · a gameweek rollover re-reads the squad rather than reusing the old one', () => {
  it('a snapshot the gameweek has moved past is retired, and the squad is captured again', async () => {
    // The live failure of 2026-09-14: a snapshot for gameweek 5 holding gameweek
    // 3's picks. Correcting the rule that chose gameweek 3 could do nothing about
    // the row already stored — the world found a snapshot and never captured
    // again, so the wrong squad stayed on screen under a correct deadline.
    let loads = 0
    const { get, events } = harness({
      lastCompletedGameweek: async () => 4,
      loadParts: async () => parts(loads++ === 0 ? 3 : 4),
    })
    await get()

    expect(events).toContain('supersede')
    expect(events).toContain('capture')
  })

  it('a snapshot that cannot say where it came from is treated as stale, not as fine', async () => {
    // Rows written before the column existed carry null. Guessing in the
    // generous direction is exactly how the stale one survives.
    let loads = 0
    const { get, events } = harness({
      lastCompletedGameweek: async () => 4,
      loadParts: async () => parts(loads++ === 0 ? null : 4),
    })
    await get()

    expect(events).toContain('supersede')
  })

  it('a current snapshot is left alone, so an ordinary open captures nothing', async () => {
    const { get, events } = harness({ lastCompletedGameweek: async () => 4, loadParts: async () => parts(4) })
    await get()

    expect(events).not.toContain('supersede')
    expect(events).not.toContain('capture')
  })
})

describe('F6-UP-03 · the clean slate is the gameweek key, and it must stay there', () => {
  /**
   * **What this proves, and what it does not** (STE-177, P16).
   *
   * The criterion says a new gameweek discards the previous shortlist,
   * decisions, filters and pending calls — *nothing is carried forward and
   * nothing is replayed.* The squad half of that is covered by the block
   * above, which causes a real rollover and asserts the re-capture.
   *
   * The rest is not enforced by any branch. It falls out of **both reads being
   * keyed to the gameweek being advised**: `world/load.ts` selects the latest
   * succeeded `run` with `.eq('gameweek', …)` and the `decision` rows with the
   * same filter, so a rolled-over week finds neither and the slate is clean by
   * construction.
   *
   * That is a good mechanism and a fragile one to assert. Exercising it
   * properly needs a real Postgres fixture holding last week's run and
   * decisions — the shape `tests/rls/isolation.test.ts` and
   * `tests/auth/throttle.pg.test.ts` use — which does not exist for the world
   * read and is a piece of work rather than a line.
   *
   * **So this is deliberately a structural check, in the open.** It cannot tell
   * you the slate is clean. It can tell you nobody removed the thing that makes
   * it clean — and dropping either filter would put last week's decisions
   * against this week's calls, which is silent, wrong, and exactly the class
   * F6-UP-03 exists to stop. The behavioural half stays named in
   * `docs/coverage-gaps.md`.
   */
  const source = readFileSync(
    fileURLToPath(new URL('../../apps/server/src/world/load.ts', import.meta.url)),
    'utf8',
  )

  it('F6-UP-03: the run a world reads is the one for the gameweek being advised', () => {
    const runRead = /\.from\('run'\)[\s\S]{0,240}?\.limit\(1\)/.exec(source)?.[0] ?? ''
    expect(runRead, "world/load.ts no longer reads the run — this check is pointing at nothing").not.toBe('')
    expect(runRead).toContain(".eq('gameweek'")
  })

  it('F6-UP-03: the decisions a world reads are the ones for the gameweek being advised', () => {
    const decisionRead = /\.from\('decision'\)[^\n]*/.exec(source)?.[0] ?? ''
    expect(decisionRead, "world/load.ts no longer reads decisions — this check is pointing at nothing").not.toBe('')
    expect(decisionRead).toContain(".eq('gameweek'")
  })
})

describe('F6-UP-03 · advice about a week already played is stopped, not shown', () => {
  const assembled = async (over: Partial<WorldParts>) => {
    const { get } = harness({ loadParts: async () => ({ ...parts(), ...over }) })
    return (await (await get()).json()) as { gameweekStop?: { reason: string; gameweek: number } }
  }

  const gw = (id: number, deadline: string) => ({
    id,
    name: `Gameweek ${String(id)}`,
    deadlineTime: deadline,
    isNext: true,
    isCurrent: false,
    finished: false,
    dataChecked: false,
  })

  it('F6-UP-03: a deadline that has passed stops the week, and names it', async () => {
    // **The check existed from the day the slice landed and nothing called it**,
    // so the failure it was written for was still uncaught: confident advice
    // about a week already played, with nothing on screen looking wrong.
    const world = await assembled({
      gameweek: gw(4, '2026-09-12T12:30:00Z'),
      projections: [{ gameweek: 4, playerId: 1, projectedPoints: 5, feedReadId: 'r' }],
      nowMs: Date.parse('2026-09-14T15:00:00Z'),
    })

    expect(world.gameweekStop).toEqual({ reason: 'deadline_passed', gameweek: 4, deadline: '2026-09-12T12:30:00Z' })
  })

  it('F6-UP-03: a week still ahead carries no stop at all', async () => {
    const world = await assembled({
      gameweek: gw(5, '2026-09-18T17:30:00Z'),
      projections: [{ gameweek: 5, playerId: 1, projectedPoints: 5, feedReadId: 'r' }],
      nowMs: Date.parse('2026-09-14T15:00:00Z'),
    })

    expect(world.gameweekStop).toBeUndefined()
  })

  it('F6-UP-03: projections that do not cover the week are two sources contradicting each other', async () => {
    const world = await assembled({
      gameweek: gw(5, '2026-09-18T17:30:00Z'),
      projections: [{ gameweek: 6, playerId: 1, projectedPoints: 5, feedReadId: 'r' }],
      nowMs: Date.parse('2026-09-14T15:00:00Z'),
    })

    expect(world.gameweekStop?.reason).toBe('projections_disagree')
  })

  it('F6-UP-03: a world with no projections at all proves nothing, and must not stop the app', async () => {
    const world = await assembled({
      gameweek: gw(5, '2026-09-18T17:30:00Z'),
      projections: [],
      nowMs: Date.parse('2026-09-14T15:00:00Z'),
    })

    expect(world.gameweekStop).toBeUndefined()
  })
})
