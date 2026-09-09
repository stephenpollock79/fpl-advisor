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
  isSecureRequest,
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

  describe('F7-AC-10: whether the cookie is marked Secure is read from the request', () => {
    // Regression. This was read from NODE_ENV, Railway does not set NODE_ENV, and
    // so the first production sign-in issued a session cookie with no Secure flag.
    // A flag that depends on a variable nobody set is a flag that is silently off.
    it('F7-AC-10: trusts x-forwarded-proto, which is how Railway reports TLS', () => {
      expect(isSecureRequest('http://internal:8787/api/auth/verify', 'https')).toBe(true)
      expect(isSecureRequest('http://internal:8787/api/auth/verify', 'https,http')).toBe(true)
      expect(isSecureRequest('http://internal:8787/api/auth/verify', 'http')).toBe(false)
    })

    it('F7-AC-10: an https request is Secure without any header', () => {
      expect(isSecureRequest('https://gaffercalls.com/api/auth/verify', undefined)).toBe(true)
    })

    it('F7-AC-10: plain http to this machine is not Secure', () => {
      expect(isSecureRequest('http://localhost:8787/api/auth/verify', undefined)).toBe(false)
      expect(isSecureRequest('http://127.0.0.1:8787/api/auth/verify', undefined)).toBe(false)
    })

    it('F7-AC-10: plain http to a private network address is not Secure either', () => {
      // A phone on the same Wi-Fi reaches the dev server by LAN address, not by
      // localhost. Marking that cookie Secure means the browser silently discards
      // it: the session row is created, the cookie never lands, and the screen
      // reports "not signed in" with nothing to say why. Observed on 2026-09-09.
      //
      // Safe because production cannot look like this. Railway terminates TLS and
      // sets x-forwarded-proto, which the branch above handles; a *direct* plain
      // http request from a private range only ever happens in development.
      expect(isSecureRequest('http://192.168.4.24:5173/api/auth/verify', undefined)).toBe(false)
      expect(isSecureRequest('http://10.0.0.5:5173/api/auth/verify', undefined)).toBe(false)
      expect(isSecureRequest('http://172.16.3.9:5173/api/auth/verify', undefined)).toBe(false)
      expect(isSecureRequest('http://gaffer.local:5173/api/auth/verify', undefined)).toBe(false)
    })

    it('F7-AC-10: a proxy saying http still fails closed, whatever the address', () => {
      // The header wins when present. A private address behind a proxy reporting
      // plain http is a misconfiguration, and the cookie must not go out in clear
      // on its say-so.
      expect(isSecureRequest('http://192.168.4.24/api/auth/verify', 'https')).toBe(true)
      expect(isSecureRequest('https://gaffercalls.com/api/auth/verify', undefined)).toBe(true)
    })

    it('F7-AC-10: anything else fails closed', () => {
      // An unknown host over http, and an unparseable URL, both get Secure. Being
      // wrong in that direction breaks a login; being wrong the other way ships a
      // session cookie in clear.
      expect(isSecureRequest('http://some-host/api/auth/verify', undefined)).toBe(true)
      expect(isSecureRequest('not a url', undefined)).toBe(true)
    })
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
