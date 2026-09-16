/**
 * The route census (STE-38): **every API route either requires a session or is
 * on a list that says why not.**
 *
 * Six route files each begin the same way — resolve the session, return 401 if
 * there is none. Six copies of one rule is a convention, and a convention is
 * kept by whoever remembers it. The seventh route is the one that forgets, and
 * it will not look wrong in a diff: a handler that simply never mentions
 * authentication reads like a handler that does not need it.
 *
 * So this discovers the routes from the apps themselves rather than from a list
 * here, sends each one a request with **no cookie**, and asserts what comes
 * back. A new route added without a session check fails this test on the day it
 * is written; a new *public* route fails it too, until someone adds it to
 * `PUBLIC` below and states the reason out loud.
 *
 * It causes the trigger rather than assuming it (P16): the requests are real,
 * and `authenticate` genuinely answers "nobody is signed in".
 */

import { describe, expect, it } from 'vitest'
import { authRoutes } from '../../apps/server/src/auth/routes.js'
import { decisionRoutes } from '../../apps/server/src/decisions/routes.js'
import { runRoutes } from '../../apps/server/src/runs/routes.js'
import { screenshotRoutes } from '../../apps/server/src/squad/screenshots.js'
import { teamLinkRoutes } from '../../apps/server/src/team-link/routes.js'
import { worldRoutes } from '../../apps/server/src/world/routes.js'

/**
 * Routes a stranger is *supposed* to reach, each with the reason it is safe.
 *
 * **Adding to this list is the point.** It is a short, deliberate list in one
 * place, so widening the unauthenticated surface is a visible act rather than
 * the absence of a line in a new file.
 */
const PUBLIC = new Map<string, string>([
  [
    'POST /api/auth/request-code',
    'The login form itself. Submitting cannot be prevented — preventing it would reveal which ' +
      'addresses exist (F7-AC-02). Nothing follows from a submission, and it is rate limited.',
  ],
  [
    'POST /api/auth/verify',
    'Exchanges a code for a session, so by definition there is no session yet. Attempt-limited, ' +
      'and a spent code is refused before the provider is called (F7-AC-09).',
  ],
  [
    'POST /api/auth/logout',
    'Takes a cookie and does not require one. Signing out while already signed out is not an ' +
      'error, and it reveals nothing.',
  ],
])

/**
 * Every dependency a route factory could want, stubbed to do nothing — except
 * the one that matters, which answers that nobody is signed in.
 *
 * A proxy rather than six hand-written objects, deliberately: a new dependency
 * added to any deps type must not quietly turn this test into a no-op by
 * throwing before the request is made.
 */
function noOneSignedIn(): never {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'authenticate') return async () => null
        // Some factories read a value at construction time rather than calling it.
        if (property === 'then') return undefined
        return async () => null
      },
    },
  ) as never
}

const apps = {
  auth: authRoutes(noOneSignedIn()),
  teamLink: teamLinkRoutes(noOneSignedIn()),
  world: worldRoutes(noOneSignedIn()),
  decisions: decisionRoutes(noOneSignedIn()),
  runs: runRoutes(noOneSignedIn()),
  screenshots: screenshotRoutes(noOneSignedIn()),
}

/** Every route the server actually declares, discovered rather than listed. */
function declaredRoutes(): { app: (typeof apps)[keyof typeof apps]; key: string; path: string; method: string }[] {
  const found: { app: (typeof apps)[keyof typeof apps]; key: string; path: string; method: string }[] = []
  for (const app of Object.values(apps)) {
    for (const route of app.routes) {
      const method = route.method.toUpperCase()
      if (method === 'ALL') continue
      const key = `${method} ${route.path}`
      if (found.some((f) => f.key === key)) continue
      found.push({ app, key, path: route.path, method })
    }
  }
  return found
}

describe('STE-38 · the unauthenticated surface', () => {
  it('finds routes at all, so an empty pass is impossible', () => {
    // Without this, every assertion below passes vacuously the day the discovery
    // breaks — a green suite proving nothing is worse than a red one.
    expect(declaredRoutes().length).toBeGreaterThanOrEqual(10)
  })

  it('every route is either behind a session or on the public list, with a reason', async () => {
    const reachable: string[] = []

    for (const { app, key, path, method } of declaredRoutes()) {
      const response = await app.request(
        new Request(`http://localhost${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: '{}' } : {}),
        }),
      )

      if (PUBLIC.has(key)) {
        // A public route must still answer rather than fall over on a request
        // with nothing in it — a 500 here is an unhandled path a stranger found.
        expect(response.status, `${key} is public and should not error`).toBeLessThan(500)
        continue
      }

      if (response.status !== 401) reachable.push(`${key} → ${response.status}`)
    }

    expect(
      reachable,
      'these routes answered something other than 401 to a request with no cookie. Either they ' +
        'need a session check, or they belong in PUBLIC above with the reason written down.',
    ).toEqual([])
  })

  it('the public list names only routes that exist', () => {
    // The citation resolves both ways. A reason left behind for a route that was
    // renamed or deleted is a licence nobody notices is still granted.
    const declared = new Set(declaredRoutes().map((r) => r.key))
    const stale = [...PUBLIC.keys()].filter((key) => !declared.has(key))

    expect(stale, 'PUBLIC names routes the server no longer has').toEqual([])
  })
})
