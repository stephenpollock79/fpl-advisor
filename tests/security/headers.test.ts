/**
 * The two headers that took a ruling, and the three that did not (STE-161).
 *
 * **These assert values, not presence.** A header still being sent proves
 * nothing about what it says, and the whole ruling on STE-161 was about the
 * values: five minutes rather than a year, report-only rather than enforcing.
 * A later edit that "tidied" either into its usual form would leave every
 * presence check green while removing the property that made shipping it safe
 * two days before a deadline.
 */

import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY, HSTS, securityHeaders } from '../../apps/server/src/security-headers.js'

describe('STE-161 · the headers every response carries', () => {
  it('STE-161: an https request gets HSTS, and a plain one does not', () => {
    // The trigger is the scheme, so the test supplies both (P16) rather than
    // asserting the map for one of them and assuming the other.
    expect(securityHeaders(true)['Strict-Transport-Security']).toBe('max-age=300')
    expect(securityHeaders(false)).not.toHaveProperty('Strict-Transport-Security')
  })

  it('STE-161: HSTS lasts minutes and never asks to be preloaded', () => {
    // A year is the usual value and is the one that cannot be undone: a
    // certificate problem then takes the site away until it expires. `preload`
    // is worse — removal means a request to a browser-vendor list.
    const seconds = Number(/max-age=(\d+)/.exec(HSTS)?.[1])
    expect(seconds).toBeLessThanOrEqual(600)
    expect(HSTS).not.toContain('preload')
  })

  it('STE-161: the policy is sent report-only, so it refuses nothing', () => {
    const headers = securityHeaders(true)
    expect(headers).toHaveProperty('Content-Security-Policy-Report-Only')
    // The enforcing header is the one that can blank the screen. Flipping to it
    // is a deliberate act for after the deadline, not something that arrives
    // with an unrelated change.
    expect(headers).not.toHaveProperty('Content-Security-Policy')
  })

  it('STE-161: the policy names both Google Fonts hosts, not just the stylesheet', () => {
    // Naming only `fonts.googleapis.com` is the classic mistake: the stylesheet
    // loads, the font files it points at do not, and the page renders in a
    // fallback face with nothing to show for it but a console line.
    expect(CONTENT_SECURITY_POLICY).toContain('https://fonts.googleapis.com')
    expect(CONTENT_SECURITY_POLICY).toContain('https://fonts.gstatic.com')
  })

  it('STE-161: scripts get no inline allowance, which is where the policy earns its keep', () => {
    const scriptSrc = /script-src ([^;]+)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? ''
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
  })

  it('STE-161: the three that never needed a ruling are still sent', () => {
    // They went in on STE-38 and nothing here should quietly drop them while
    // attention is on the two new ones.
    const headers = securityHeaders(false)
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
})
