/**
 * `POST /api/auth/verify` — the attempt limit (F7-AC-09) and the one error that
 * is allowed to be distinguishable (F7-UP-02).
 *
 * Six digits inside a ten-minute window is brute-forceable if attempts are
 * unbounded, so the attempt limit rather than the code's length is what makes
 * the code safe. Every test here makes the attempts for real rather than setting
 * a counter by hand — the criterion is about what happens when someone actually
 * guesses, and a hand-set counter proves the assertion while proving nothing
 * about the rule.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AuthDeps, type VerifiedSession, authRoutes } from '../../apps/server/src/auth/routes.js'
import {
  type Clock,
  type MemoryAttempts,
  type MemoryThrottle,
  clock,
  memoryAttempts,
  memoryThrottle,
} from './stores.js'

let c: Clock
let throttle: MemoryThrottle
let attempts: MemoryAttempts

const fakeDigest = (value: string) => `digest(${[...value].reduce((a, ch) => a + ch.charCodeAt(0), 0)})`

const SESSION: VerifiedSession = {
  userId: 'user-1',
  refreshToken: 'refresh',
  accessToken: 'access',
  accessTokenExpiresAt: '2026-09-16T13:00:00.000Z',
}

function harness(overrides: Partial<AuthDeps> = {}) {
  const verifyCode = vi.fn(async () => null as VerifiedSession | null)
  const deps: AuthDeps = {
    sendCode: vi.fn(async () => ({ error: null })),
    verifyCode,
    createSession: vi.fn(async () => 'session-token'),
    ensureManagerRow: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
    authenticate: vi.fn(async () => null),
    readManager: vi.fn(async () => null),
    subjectOf: fakeDigest,
    throttle,
    attempts,
    ...overrides,
  }
  return { app: authRoutes(deps), verifyCode: deps.verifyCode as typeof verifyCode, deps }
}

const verify = (email: string, code: string) =>
  new Request('http://localhost/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })

const requestCode = (email: string) =>
  new Request('http://localhost/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

const errorOf = async (r: Response) => ((await r.json()) as { error?: string }).error

beforeEach(() => {
  c = clock()
  attempts = memoryAttempts()
  throttle = memoryThrottle(c, attempts)
  vi.restoreAllMocks()
})

describe('F7-AC-09, F7-UP-02 · a code dies after five wrong attempts', () => {
  it('F7-AC-09, F7-UP-02: the fifth wrong attempt says the code is spent, not the sixth', async () => {
    /**
     * **This test used to assert the opposite, and it was wrong.**
     *
     * It checked that attempts one to five all read `invalid_code` and the sixth
     * read `code_spent` — which is what the build did, so it passed. F7-UP-02
     * asks for the error to say the code is spent "rather than leaving the
     * manager retyping a code that can no longer work", and the old behaviour
     * left him doing exactly that: a fifth message worded identically to the
     * first four, with nothing to say the code had just died.
     *
     * Found by Stephen on a phone on 2026-09-16. The test had encoded the build
     * rather than the criterion, which is the failure P16 is about wearing
     * different clothes — the trigger was reached, and the assertion was of the
     * wrong thing.
     */
    const { app } = harness()

    for (let n = 0; n < 4; n += 1) {
      expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('invalid_code')
    }

    expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('code_spent')
  })

  it('F7-AC-09: once spent, no further attempt reaches the provider', async () => {
    const { app, verifyCode } = harness()

    for (let n = 0; n < 5; n += 1) await app.request(verify('someone@example.com', '000000'))
    expect(verifyCode).toHaveBeenCalledTimes(5)

    // An attempt that reaches Supabase is an attempt, so the sixth must not.
    expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('code_spent')
    expect(verifyCode).toHaveBeenCalledTimes(5)
  })

  it('F7-UP-02: wrong, expired and already-used stay indistinguishable from each other', async () => {
    // The provider knows which of the three it was; this route must not say. Only
    // exhaustion is distinguished, and only because it is the one case where
    // retyping the same code can never work.
    const { app } = harness()

    const first = await errorOf(await app.request(verify('someone@example.com', '111111')))
    const second = await errorOf(await app.request(verify('someone@example.com', '222222')))

    expect(first).toBe('invalid_code')
    expect(second).toBe('invalid_code')
  })

  it('F7-AC-09: the count is kept for an address the provider does not know', async () => {
    // If the counter existed only for real accounts, an unknown address would
    // read invalid_code for ever while a known one flipped to code_spent — which
    // is the enumeration oracle request-code just closed, arriving by the other
    // door. So the two must behave identically here.
    const known = harness()
    const unknown = harness()

    for (let n = 0; n < 5; n += 1) {
      await known.app.request(verify('has@account.com', '000000'))
      await unknown.app.request(verify('no@account.com', '000000'))
    }

    expect(await errorOf(await known.app.request(verify('has@account.com', '000000')))).toBe('code_spent')
    expect(await errorOf(await unknown.app.request(verify('no@account.com', '000000')))).toBe('code_spent')
  })

  it('F7-AC-09: a code that is actually sent clears the count', async () => {
    const { app, verifyCode } = harness()
    for (let n = 0; n < 5; n += 1) await app.request(verify('someone@example.com', '000000'))
    expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('code_spent')

    // A real request-code, which the throttle allows — not a direct call to clear.
    await app.request(requestCode('someone@example.com'))

    expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('invalid_code')
    expect(verifyCode).toHaveBeenCalledTimes(6)
  })

  it('F7-AC-09: a throttled request-code does not clear the count', async () => {
    // The most important test in this file. A throttled request sends nothing, so
    // the live code is still live; clearing here would be an unlimited guessing
    // loop for one extra POST per five attempts.
    const { app } = harness()
    await app.request(requestCode('someone@example.com'))
    for (let n = 0; n < 5; n += 1) await app.request(verify('someone@example.com', '000000'))

    c.advance(5)
    await app.request(requestCode('someone@example.com'))

    expect(await errorOf(await app.request(verify('someone@example.com', '000000')))).toBe('code_spent')
  })

  it('F7-AC-09: a successful verify clears the count', async () => {
    const { app } = harness({ verifyCode: vi.fn(async () => SESSION) })

    const response = await app.request(verify('someone@example.com', '123456'))

    expect(response.status).toBe(200)
    expect(attempts.countOf(fakeDigest('someone@example.com'))).toBe(0)
  })

  it('F7-AC-09: the address is normalised, so capitals do not buy five more guesses', async () => {
    const { app } = harness()
    for (let n = 0; n < 5; n += 1) await app.request(verify('someone@example.com', '000000'))

    expect(await errorOf(await app.request(verify('SomeOne@Example.com', '000000')))).toBe('code_spent')
  })
})
