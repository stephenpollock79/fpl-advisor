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
import {
  confirmationIsValid,
  mintConfirmation,
} from '../../apps/server/src/team-link/confirmation.js'
import { teamLinkRoutes } from '../../apps/server/src/team-link/routes.js'

/**
 * A fixed secret, and the **real** mint and verify bound to it rather than
 * stubs. The criterion is that a confirm is bound to a resolve, so a stubbed
 * binding would prove the routes call something and nothing about whether the
 * binding holds.
 */
const SECRET = 'test-secret-not-a-real-one'

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
    mintConfirmation: (user: { userId: string }, fplTeamId: number) =>
      mintConfirmation(SECRET, user.userId, fplTeamId),
    confirmationIsValid: (user: { userId: string }, fplTeamId: number, token: unknown) =>
      confirmationIsValid(SECRET, user.userId, fplTeamId, token),
    ...overrides,
  }
  return { app: teamLinkRoutes(deps), deps, saveLink }
}

/** Resolves an identifier and hands back the token that resolve issued for it. */
async function resolved(app: ReturnType<typeof teamLinkRoutes>, fplTeamId: number): Promise<string> {
  const response = await app.request(post('/api/team-link/resolve', { fplTeamId }))
  return ((await response.json()) as { confirmation: string }).confirmation
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
      // Handed back so the confirm that follows can be tied to this resolve.
      confirmation: expect.stringMatching(/^\d+\.[A-Za-z0-9_-]+$/),
    })
    // The whole point of the criterion: a mistyped identifier is usually still a
    // valid one belonging to a stranger, so nothing is written until it is accepted.
    expect(saveLink).not.toHaveBeenCalled()
  })
})

describe('accepting the resolved team', () => {
  it('F7-AC-13, F7-AC-11: confirm stores the link, written as the signed-in user', async () => {
    const { app, saveLink } = harness()
    const confirmation = await resolved(app, 314159)

    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159, confirmation }))

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
    const confirmation = await resolved(app, 314159)

    await app.request(
      post('/api/team-link/confirm', {
        fplTeamId: 314159,
        confirmation,
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

/**
 * The half of F7-AC-14 that did not exist until slice 10.
 *
 * `docs/coverage-gaps.md` carried this as an open gap: the tests above prove
 * resolve stores nothing and that confirm writes what FPL returns rather than
 * what the browser posted — **neither proves the ordering**, which is the
 * criterion's own wording. A direct POST to confirm linked a team that had never
 * been shown back, and the guarantee lived entirely in `LinkTeam.tsx`.
 */
describe('F7-AC-14 · the identifier is confirmed before it is linked', () => {
  it('F7-AC-14: a confirm with no prior resolve neither stores nor reads FPL', async () => {
    const { app, saveLink, deps } = harness()

    // The exact request that used to link a stranger's team silently.
    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159 }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'not_confirmed' })
    expect(saveLink).not.toHaveBeenCalled()
    // Checked before the upstream read, so a forged confirm costs nothing and
    // cannot be mistaken for FPL being unreachable.
    expect(deps.fetchEntry).not.toHaveBeenCalled()
  })

  it('F7-AC-14: the token a resolve hands back confirms that identifier', async () => {
    const { app, saveLink } = harness()

    // The trigger is a real resolve, and the token is taken out of its response
    // rather than minted by the test.
    const confirmation = await resolved(app, 314159)
    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159, confirmation }))

    expect(response.status).toBe(200)
    expect(saveLink).toHaveBeenCalledTimes(1)
  })

  it('F7-AC-14: a token for one team does not confirm another', async () => {
    // The criterion's own reason for existing: a mistyped identifier is usually
    // still a valid one belonging to a stranger. Resolving 314159 must not let
    // 271828 be linked.
    const { app, saveLink } = harness()
    const confirmation = await resolved(app, 314159)

    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 271828, confirmation }))

    expect(response.status).toBe(400)
    expect(saveLink).not.toHaveBeenCalled()
  })

  it('F7-AC-14: a token minted for another user does not confirm for this one', async () => {
    const other = mintConfirmation(SECRET, 'user-2', 314159)
    const { app, saveLink } = harness()

    const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159, confirmation: other }))

    expect(response.status).toBe(400)
    expect(saveLink).not.toHaveBeenCalled()
  })

  it('F7-AC-14: a tampered or expired token is refused', async () => {
    const { app, saveLink } = harness()
    const good = await resolved(app, 314159)
    const [expiry, mac] = good.split('.')

    const expired = mintConfirmation(SECRET, 'user-1', 314159, Date.now() - 601_000)
    const tampered = `${expiry}.${mac!.slice(0, -1)}${mac!.endsWith('A') ? 'B' : 'A'}`
    const nonsense = 'not-a-token'

    for (const confirmation of [expired, tampered, nonsense]) {
      const response = await app.request(post('/api/team-link/confirm', { fplTeamId: 314159, confirmation }))
      expect(response.status, `for ${confirmation}`).toBe(400)
    }
    expect(saveLink).not.toHaveBeenCalled()
  })

  it('F7-AC-14: the token carries no identity, only an expiry and a signature', async () => {
    // Nothing to parse out of an untrusted string, and a captured token says
    // nothing about whose it was.
    const { app } = harness()
    const confirmation = await resolved(app, 314159)

    expect(confirmation).not.toContain('user-1')
    expect(confirmation).not.toContain('314159')
  })
})
