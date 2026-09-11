/**
 * Recording the manager's decision on a call (F3-AC-01, F3-AC-02, F3-AC-14).
 *
 * Collaborators are injected, as for the team-link and world routes, so the
 * route is exercised without a database. What the database itself guarantees —
 * that one manager cannot touch another's decisions — is the isolation suite's.
 */

import { describe, expect, it } from 'vitest'
import { type DecisionDeps, decisionRoutes } from '../../apps/server/src/decisions/routes.js'

const user = { userId: 'u1', accessToken: 't1' }

const harness = () => {
  const written: { gameweek: number; callKey: string; state: string }[] = []
  const cleared: { gameweek: number; callKey: string }[] = []
  const deps: DecisionDeps = {
    authenticate: async (cookie) => (cookie ? (user as never) : null),
    gameweek: async () => 4,
    record: async (_u, gameweek, callKey, state) => {
      written.push({ gameweek, callKey, state })
    },
    clear: async (_u, gameweek, callKey) => {
      cleared.push({ gameweek, callKey })
    },
  }
  const app = decisionRoutes(deps)
  const post = (body: unknown, cookie = 'session=x') =>
    app.request('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    })
  return { post, written, cleared }
}

const KEY = 'substitution:upgrade:out=557:in=40'

describe('F3-AC-01, F3-AC-02, F3-AC-14 · a decision per call', () => {
  it('F3-AC-01: selecting stores a selected decision, for the gameweek being advised on', async () => {
    const h = harness()
    const response = await h.post({ callKey: KEY, state: 'selected' })

    expect(response.status).toBe(200)
    expect(h.written).toEqual([{ gameweek: 4, callKey: KEY, state: 'selected' }])
  })

  it('F3-AC-01: rejecting stores a rejected decision', async () => {
    const h = harness()
    await h.post({ callKey: KEY, state: 'rejected' })
    expect(h.written).toEqual([{ gameweek: 4, callKey: KEY, state: 'rejected' }])
  })

  it('F3-AC-14: returning a call to pending review removes its decision — pending is no row', async () => {
    const h = harness()
    const response = await h.post({ callKey: KEY, state: 'pending' })

    expect(response.status).toBe(200)
    expect(h.written).toEqual([])
    expect(h.cleared).toEqual([{ gameweek: 4, callKey: KEY }])
  })

  it('F3-AC-02: only the named call is touched, never its category', async () => {
    const h = harness()
    await h.post({ callKey: 'transfer:out=1:in=2', state: 'selected' })
    expect(h.written.map((w) => w.callKey)).toEqual(['transfer:out=1:in=2'])
  })

  it('refuses a state that is not one of the three', async () => {
    const h = harness()
    const response = await h.post({ callKey: KEY, state: 'maybe' })
    expect(response.status).toBe(400)
    expect(h.written).toEqual([])
  })

  it('refuses a missing call key', async () => {
    const h = harness()
    expect((await h.post({ state: 'selected' })).status).toBe(400)
  })

  it('answers 401 to a signed-out request and writes nothing', async () => {
    const h = harness()
    const response = await h.post({ callKey: KEY, state: 'selected' }, '')
    expect(response.status).toBe(401)
    expect(h.written).toEqual([])
  })
})
