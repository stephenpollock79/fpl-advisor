/**
 * `F7-UP-04`'s second half: **there is no route to create an account.**
 *
 * The first half — nothing about any squad before sign-in — is covered in a real
 * browser by `tests/e2e/landing.spec.ts`. This is the half that was promised in
 * slice 10's spec and not written, and the cold review was right to name it.
 *
 * **It is not a scan for the word "signup".** The only route in this server that
 * ever mentions an address to the provider is `request-code`, and the single
 * thing standing between it and account creation is one option on one call. Flip
 * that option and a stranger's address gets an account, from our own login
 * screen, with nothing on screen or in any other test to say so.
 *
 * That is not hypothetical. On 2026-09-16 the provider's own registration
 * endpoint turned out to be open on both projects (STE-159), and the comment in
 * `routes.ts` had said for a week that the two halves backed each other up. One
 * of them had never been true. This asserts the half that lives here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOtp = vi.fn(async () => ({ error: null }))

vi.mock('../../apps/server/src/supabase.js', () => ({
  authClient: () => ({ auth: { signInWithOtp } }),
  userClient: () => ({}),
  referenceClient: () => ({}),
  sessionClient: () => ({}),
  throttleClient: () => ({}),
}))

const { authDeps } = await import('../../apps/server/src/auth/wire.js')
const { authRoutes } = await import('../../apps/server/src/auth/routes.js')

const env = { sessionCookieSecret: 'test-secret' } as never

beforeEach(() => {
  signInWithOtp.mockClear()
})

describe('F7-UP-04 · a stranger reaches the URL', () => {
  it('F7-UP-04: asking for a code never asks the provider to create an account', async () => {
    // The trigger is a real request for an address nobody has ever heard of —
    // the exact thing a stranger with the URL would do.
    await authDeps(env).sendCode('a-stranger@example.com')

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'a-stranger@example.com',
      options: { shouldCreateUser: false },
    })
  })

  it('F7-UP-04: the option is false rather than merely absent', async () => {
    // Stated separately because the failure modes differ and only one of them
    // looks wrong in a diff. Deleting the whole `options` object leaves the
    // provider's own default in charge, which has been *create* on this project
    // for its entire life (STE-159) — so an omission is not a safe omission.
    await authDeps(env).sendCode('a-stranger@example.com')

    const [call] = signInWithOtp.mock.calls as unknown as [
      [{ options?: { shouldCreateUser?: boolean } }],
    ]
    expect(call[0].options?.shouldCreateUser).toBe(false)
  })

  it('F7-UP-04: the server publishes no route that could create an account', async () => {
    const paths = authRoutes({
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
    }).routes.map((r) => r.path)

    // Read off the app rather than listed here, so a route added later is caught
    // rather than missed by a list nobody updated.
    expect(paths.sort()).toEqual([
      '/api/auth/logout',
      '/api/auth/request-code',
      '/api/auth/verify',
      '/api/me',
    ])
  })
})
