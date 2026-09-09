/**
 * The two team-link routes (STE-55).
 *
 * Tested through the Hono app itself rather than by calling handlers, because
 * the claim worth proving is about the whole request: **resolve returns the team
 * and stores nothing** (F7-AC-14). That is invisible from inside the mapping and
 * from inside the write — it only exists at the route boundary.
 *
 * The FPL read, the session lookup and the write are injected, so no test here
 * touches the network or a database.
 */

import { describe, expect, it, vi } from 'vitest'
import { teamLinkRoutes } from '../../apps/server/src/team-link/routes.js'

const entry = {
  id: 314159,
  name: 'Kloppers United',
  player_first_name: 'Ada',
  player_last_name: 'Lovelace',
  summary_overall_rank: 2_523_055,
}

function harness(overrides: Partial<Parameters<typeof teamLinkRoutes>[0]> = {}) {
  const saveLink = vi.fn(async () => undefined)
  const deps = {
    fetchEntry: vi.fn(async () => entry),
    authenticate: vi.fn(async () => ({ userId: 'user-1', accessToken: 'token-1' })),
    saveLink,
    ...overrides,
  }
  return { app: teamLinkRoutes(deps), deps, saveLink }
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'gaffer_session=abc' },
    body: JSON.stringify(body),
  })
}

describe('linking an FPL team', () => {
  it('F7-AC-14: resolve returns the team for acceptance and stores nothing', async () => {
    const { app, saveLink } = harness()

    const response = await app.request(post('/api/team-link/resolve', { fplTeamId: 314159 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      team: {
        fplTeamId: 314159,
        teamName: 'Kloppers United',
        managerName: 'Ada Lovelace',
        overallRank: 2_523_055,
      },
    })
    // The whole point of the criterion: a mistyped identifier is usually still a
    // valid one belonging to a stranger, so nothing is written until it is accepted.
    expect(saveLink).not.toHaveBeenCalled()
  })
})

describe('accepting the resolved team', () => {
  it('F7-AC-13, F7-AC-11: confirm stores the link, written as the signed-in user', async () => {
    const { app, saveLink } = harness()

    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'linked' })
    // Written with the user's own access token, so the row policies run. The
    // service key would bypass them and nothing on screen would look wrong.
    expect(saveLink).toHaveBeenCalledWith({ userId: 'user-1', accessToken: 'token-1' }, {
      fplTeamId: 314159,
      teamName: 'Kloppers United',
      managerName: 'Ada Lovelace',
      overallRank: 2_523_055,
    })
  })

  it('F7-AC-13: confirm re-reads FPL rather than trusting the posted team', async () => {
    const { app, saveLink } = harness()

    await app.request(
      post('/api/team-link/confirm', {
        fplTeamId: 314159,
        teamName: 'Not This One',
        managerName: 'Someone Else',
        overallRank: 1,
      }),
    )

    // The client may post anything. What gets stored is what FPL returns for the
    // identifier, never what the browser claimed the team was called.
    expect(saveLink).toHaveBeenCalledWith(
      { userId: 'user-1', accessToken: 'token-1' },
      expect.objectContaining({ teamName: 'Kloppers United' }),
    )
  })
})

describe('the guards on both routes', () => {
  // No criterion identifier here, deliberately. Gating these two routes behind a
  // session is a decision made in this slice, not something the PRD asks for —
  // naming a criterion would inflate the coverage figure with an invention. Same
  // reasoning as tests/auth/env.test.ts.
  it('refuses either route when nobody is signed in, and stores nothing', async () => {
    const { app, saveLink } = harness({ authenticate: vi.fn(async () => null) })

    for (const path of ['/api/team-link/resolve', '/api/team-link/confirm']) {
      const response = await app.request(post(path, { fplTeamId: 314159 }))
      expect(response.status).toBe(401)
    }
    expect(saveLink).not.toHaveBeenCalled()
  })

  it('F7-AC-14: rejects an identifier that is not a positive whole number, without calling FPL', async () => {
    const { app, deps } = harness()

    for (const fplTeamId of ['not-a-number', 0, -3, 4.5, null]) {
      const response = await app.request(post('/api/team-link/resolve', { fplTeamId }))
      expect(response.status, `for ${JSON.stringify(fplTeamId)}`).toBe(400)
    }
    expect(deps.fetchEntry).not.toHaveBeenCalled()
  })

  it('F7-AC-14: reports a team that does not exist, rather than a blank one', async () => {
    const { app } = harness({ fetchEntry: vi.fn(async () => null) })

    const response = await app.request(post('/api/team-link/resolve', { fplTeamId: 999_999_999 }))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'team_not_found' })
  })
})
