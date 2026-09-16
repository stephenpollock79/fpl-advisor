/**
 * `POST /api/auth/request-code` — the route whose criterion was false for eight
 * days while every test of it would have passed.
 *
 * The body has always been identical. The clock was not: 3.46s for an address
 * with an account against 0.045s for one without, measured on 2026-09-08. So
 * the tests here assert *ordering* and *work done*, never elapsed milliseconds —
 * a wall-clock assertion would be flaky, and would pass on a fast machine over
 * code that still waited.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AuthDeps, authRoutes } from '../../apps/server/src/auth/routes.js'
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

/** Digests are opaque and stable; the real one is an HMAC, and this is enough to tell buckets apart. */
const fakeDigest = (value: string) => `digest(${[...value].reduce((a, ch) => a + ch.charCodeAt(0), 0)})`

function harness(overrides: Partial<AuthDeps> = {}) {
  const sendCode = vi.fn(async () => ({ error: null }))
  const deps: AuthDeps = {
    sendCode,
    verifyCode: vi.fn(async () => null),
    createSession: vi.fn(async () => 'token'),
    ensureManagerRow: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
    authenticate: vi.fn(async () => null),
    readManager: vi.fn(async () => null),
    subjectOf: fakeDigest,
    throttle,
    attempts,
    ...overrides,
  }
  return { app: authRoutes(deps), sendCode: deps.sendCode as typeof sendCode, deps }
}

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

/** Status, raw bytes and header names — not parsed JSON, which would not notice a new header. */
async function shape(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.keys()].sort(),
  }
}

beforeEach(() => {
  c = clock()
  attempts = memoryAttempts()
  throttle = memoryThrottle(c, attempts)
  vi.restoreAllMocks()
})

describe('F7-AC-02, F7-AC-05, F7-UP-01 · nothing follows from a submission', () => {
  it('F7-AC-02, F7-AC-05, F7-UP-01: the response is returned before the provider send settles', async () => {
    // A send that never finishes. If the route awaits it this test times out,
    // which is P16's third check — delete the behaviour and watch it fail —
    // built into the test rather than run by hand.
    let settle!: (r: { error: null }) => void
    const sendCode = vi.fn(
      () => new Promise<{ error: null }>((resolve) => { settle = resolve }),
    )
    const { app } = harness({ sendCode: sendCode as unknown as AuthDeps['sendCode'] })

    const response = await app.request(request({ email: 'someone@example.com' }))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(JSON.stringify({ status: 'code_requested' }))
    // The criterion is that the answer does not WAIT for the send, not that the
    // send never happens.
    expect(sendCode).toHaveBeenCalledWith('someone@example.com')

    // Settled here so the detached promise does not outlive the test file.
    settle({ error: null })
  })

  it('F7-AC-02, F7-AC-05, F7-UP-01: an unknown address and a known one return the same bytes', async () => {
    // The trigger is the provider actually reporting the two cases differently,
    // which is what it does in production.
    const known = harness({ sendCode: vi.fn(async () => ({ error: null })) })
    const unknown = harness({
      sendCode: vi.fn(async () => ({ error: { message: 'Signups not allowed for otp' } })),
    })

    const a = await shape(await known.app.request(request({ email: 'has@account.com' })))
    const b = await shape(await unknown.app.request(request({ email: 'no@account.com' })))

    expect(a).toEqual(b)
  })

  it('F7-AC-07, F7-UP-03: a throttled request returns the same bytes as an accepted one', async () => {
    const { app, sendCode } = harness()

    const accepted = await shape(await app.request(request({ email: 'someone@example.com' })))
    c.advance(5)
    const throttled = await shape(await app.request(request({ email: 'someone@example.com' })))

    expect(throttled).toEqual(accepted)
    // And the second one genuinely was throttled rather than simply identical.
    expect(sendCode).toHaveBeenCalledTimes(1)
  })

  it('F7-AC-07: a throttle store that is down denies the send and answers identically', async () => {
    const { app, sendCode } = harness()
    const baseline = await shape(await app.request(request({ email: 'someone@example.com' })))

    throttle.breakIt()
    c.advance(120)
    const broken = await shape(await app.request(request({ email: 'someone@example.com' })))

    expect(broken).toEqual(baseline)
    expect(sendCode).toHaveBeenCalledTimes(1)
  })

  it('F7-AC-02: a provider failure is logged for the operator and never reaches the caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { app } = harness({
      sendCode: vi.fn(async () => ({ error: { message: 'smtp exploded' } })),
    })

    const response = await app.request(request({ email: 'someone@example.com' }))

    expect(await response.text()).toBe(JSON.stringify({ status: 'code_requested' }))
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('smtp exploded'))
    })
  })
})

describe('F7-AC-06 · the limits, and that they are invisible', () => {
  it('F7-AC-06: a second request inside sixty seconds sends nothing', async () => {
    const { app, sendCode } = harness()

    await app.request(request({ email: 'someone@example.com' }))
    c.advance(59)
    await app.request(request({ email: 'someone@example.com' }))
    expect(sendCode).toHaveBeenCalledTimes(1)

    c.advance(2)
    await app.request(request({ email: 'someone@example.com' }))
    expect(sendCode).toHaveBeenCalledTimes(2)
  })

  it('F7-AC-06: a sixth request in an hour sends nothing, at five per address', async () => {
    const { app, sendCode } = harness()

    // Six real requests, spaced past the minute limit so only the ceiling can bite.
    for (let n = 0; n < 6; n += 1) {
      await app.request(request({ email: 'someone@example.com' }))
      c.advance(70)
    }

    expect(sendCode).toHaveBeenCalledTimes(5)
  })

  it('F7-AC-06: a sixth request from one source across six addresses sends nothing', async () => {
    const { app, sendCode } = harness()

    // Every address is new, so the per-address ceiling cannot fire. This passes
    // only if the source ceiling is real rather than shadowed by it.
    for (let n = 0; n < 6; n += 1) {
      await app.request(request({ email: `person${n}@example.com` }, { 'X-Forwarded-For': '203.0.113.7' }))
      c.advance(70)
    }

    expect(sendCode).toHaveBeenCalledTimes(5)
  })

  it('F7-AC-06: a caller cannot choose its own bucket by prepending to X-Forwarded-For', async () => {
    const { app, sendCode } = harness()

    // Two requests from the same real source, each claiming a different one in
    // front of it. Taking the first entry would give them separate buckets and
    // the minute limit would never bite.
    await app.request(request({ email: 'a@example.com' }, { 'X-Forwarded-For': '9.9.9.9, 203.0.113.7' }))
    c.advance(1)
    await app.request(request({ email: 'b@example.com' }, { 'X-Forwarded-For': '8.8.8.8, 203.0.113.7' }))
    c.advance(1)
    await app.request(request({ email: 'c@example.com' }, { 'X-Forwarded-For': '7.7.7.7, 203.0.113.7' }))
    c.advance(1)
    await app.request(request({ email: 'd@example.com' }, { 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' }))
    c.advance(1)
    await app.request(request({ email: 'e@example.com' }, { 'X-Forwarded-For': '5.5.5.5, 203.0.113.7' }))
    c.advance(1)
    await app.request(request({ email: 'f@example.com' }, { 'X-Forwarded-For': '4.4.4.4, 203.0.113.7' }))

    expect(sendCode).toHaveBeenCalledTimes(5)
  })

  it('F7-AC-06: A@X.com and a@x.com share one bucket', async () => {
    const { app, sendCode } = harness()

    await app.request(request({ email: 'Someone@Example.com' }))
    c.advance(5)
    await app.request(request({ email: ' someone@example.com ' }))

    // Without normalisation these are two buckets and the second one sends.
    expect(sendCode).toHaveBeenCalledTimes(1)
  })

  it('F7-AC-06: the subject counted against is a digest, never the address', async () => {
    const { app } = harness()
    await app.request(request({ email: 'someone@example.com' }, { 'X-Forwarded-For': '203.0.113.7' }))

    expect(throttle.seen.size).toBeGreaterThan(0)
    for (const subject of throttle.seen) {
      expect(subject).not.toContain('@')
      expect(subject).not.toContain('someone')
      expect(subject).not.toContain('203.0.113.7')
    }
  })

  it('F7-AC-06: nothing reaches the provider once the ceiling is reached', async () => {
    // The send allowance is what F7-AC-07's second sentence is protecting, and
    // a limit that still calls out protects nothing.
    const { app, sendCode } = harness()
    for (let n = 0; n < 5; n += 1) {
      await app.request(request({ email: 'someone@example.com' }))
      c.advance(70)
    }
    sendCode.mockClear()

    for (let n = 0; n < 10; n += 1) {
      await app.request(request({ email: 'someone@example.com' }))
      c.advance(70)
    }

    expect(sendCode).not.toHaveBeenCalled()
  })
})

describe('F7-AC-09 · what a request-code does to the attempt count', () => {
  const subject = fakeDigest('someone@example.com')

  it('F7-AC-09: a code that is actually sent clears the count', async () => {
    const { app } = harness()
    for (let n = 0; n < 5; n += 1) await attempts.bump(subject)
    expect(attempts.countOf(subject)).toBe(5)

    await app.request(request({ email: 'someone@example.com' }))

    expect(attempts.countOf(subject)).toBe(0)
  })

  it('F7-AC-09: a throttled request does not clear the count', async () => {
    // The most important test in this file. A throttled request sends nothing,
    // so the live code is still live — clearing here would hand an attacker five
    // fresh guesses for the price of one extra POST.
    const { app } = harness()
    await app.request(request({ email: 'someone@example.com' }))
    for (let n = 0; n < 5; n += 1) await attempts.bump(subject)

    c.advance(5)
    await app.request(request({ email: 'someone@example.com' }))

    expect(attempts.countOf(subject)).toBe(5)
  })
})
