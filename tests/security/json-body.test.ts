/**
 * Bodies the routes were not expecting (STE-38).
 *
 * The red-team probes found `/api/auth/request-code` and `/api/auth/verify`
 * returning **500** to a request body of the four characters `null` — from a
 * stranger, unauthenticated, on the live app.
 *
 * Every route had written its own `await c.req.json().catch(() => ({}))`, which
 * handles a body that is not JSON and does nothing about a body that is valid
 * JSON and not an object. `null` is valid JSON, and `const { email } = null`
 * throws. **The `.catch` looked like the guard and was half of one** — a defence
 * written against the failure someone imagined, sitting beside the one they did
 * not.
 */

import { describe, expect, it, vi } from 'vitest'
import { type AuthDeps, authRoutes } from '../../apps/server/src/auth/routes.js'
import { jsonObject } from '../../apps/server/src/json-body.js'
import { teamLinkRoutes } from '../../apps/server/src/team-link/routes.js'

const body = (raw: string) => new Request('http://localhost/x', { method: 'POST', body: raw })

describe('reading a request body', () => {
  it('anything that is not a JSON object reads as no fields', async () => {
    for (const raw of ['null', '[]', '"hello"', '42', 'true', 'not json at all', '']) {
      expect(await jsonObject(body(raw)), `for ${JSON.stringify(raw)}`).toEqual({})
    }
  })

  it('an object still reads as itself', async () => {
    expect(await jsonObject(body('{"email":"a@b.com"}'))).toEqual({ email: 'a@b.com' })
  })

  it('an array does not slip through as an empty object', async () => {
    // `[]['email']` is undefined rather than a throw, so an array would pass the
    // caller's validation as "no fields given" while being a different kind of
    // wrong input. Excluded explicitly so the caller's 400 names the real cause.
    expect(await jsonObject(body('[{"email":"a@b.com"}]'))).toEqual({})
  })
})

function auth() {
  const deps: AuthDeps = {
    sendCode: vi.fn(async () => ({ error: null })),
    verifyCode: vi.fn(async () => null),
    createSession: vi.fn(async () => 'token'),
    ensureManagerRow: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
    authenticate: vi.fn(async () => null),
    readManager: vi.fn(async () => null),
    subjectOf: (v: string) => v,
    throttle: { allow: vi.fn(async () => true) },
    attempts: {
      spent: vi.fn(async () => false),
      bump: vi.fn(async () => ({ nowSpent: false })),
      clear: vi.fn(async () => undefined),
    },
  }
  return authRoutes(deps)
}

describe('STE-38 · no request body reaches an unhandled error', () => {
  const NASTY = ['null', '[]', '"hello"', '42', 'not json', '', '{"email":{"nested":true}}']

  it('the login routes answer every malformed body without a 500', async () => {
    // The trigger is the real request. `null` is the one that was actually
    // returning 500 on the deployed app; the rest are its siblings.
    for (const raw of NASTY) {
      for (const path of ['/api/auth/request-code', '/api/auth/verify']) {
        const response = await auth().request(
          new Request(`http://localhost${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: raw,
          }),
        )
        expect(response.status, `${path} with body ${JSON.stringify(raw)}`).toBeLessThan(500)
      }
    }
  })

  it('the team-link routes answer every malformed body without a 500', async () => {
    const app = teamLinkRoutes({
      fetchEntry: vi.fn(async () => null),
      authenticate: vi.fn(async () => ({ userId: 'u', accessToken: 't' })),
      saveLink: vi.fn(async () => undefined),
      mintConfirmation: () => 'token',
      confirmationIsValid: () => true,
    })

    for (const raw of NASTY) {
      for (const path of ['/api/team-link/resolve', '/api/team-link/confirm']) {
        const response = await app.request(
          new Request(`http://localhost${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: 'gaffer_session=abc' },
            body: raw,
          }),
        )
        expect(response.status, `${path} with body ${JSON.stringify(raw)}`).toBeLessThan(500)
      }
    }
  })
})
