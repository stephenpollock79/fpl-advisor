/**
 * The session cookie.
 *
 * These cover the half of F7-AC-10 that is a pure function — the shape of the
 * cookie and the length of the window. The other half, "renewed on each visit",
 * is a database write on every authenticated request and is not asserted here;
 * it needs a live Supabase project. See docs/manual-coverage.md.
 */

import { describe, expect, it } from 'vitest'
import {
  COOKIE_NAME,
  WINDOW_DAYS,
  clearedCookieHeader,
  cookieHeader,
  readCookie,
} from '../../apps/server/src/auth/session.js'

describe('F7-AC-10 · the session is long and sliding', () => {
  it('F7-AC-10: the cookie carries a thirty-day window', () => {
    expect(WINDOW_DAYS).toBe(30)
    expect(cookieHeader('t', true)).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
  })

  it('F7-AC-10: the browser cannot read the cookie, and never holds a provider token', () => {
    // ADR 0007: the value here is an opaque token of ours. Everything Supabase
    // issued stays server-side, in the row this token points at.
    const header = cookieHeader('opaque-token', true)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Secure')
  })

  it('omits Secure outside production, so local http development works', () => {
    expect(cookieHeader('t', false)).not.toContain('Secure')
  })

  it('reads its own cookie back, and ignores the others around it', () => {
    const header = `other=1; ${COOKIE_NAME}=abc123; another=2`
    expect(readCookie(header)).toBe('abc123')
    expect(readCookie('other=1')).toBeNull()
    expect(readCookie(undefined)).toBeNull()
  })

  it('clears by expiring rather than by asking nicely', () => {
    expect(clearedCookieHeader(true)).toContain('Max-Age=0')
  })
})
