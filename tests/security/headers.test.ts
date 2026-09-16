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
    // asserting the map for one of them and assuming the other. A plain request
    // is local development, and claiming this about localhost would be claiming
    // something nobody meant.
    expect(securityHeaders(true)['Strict-Transport-Security']).toBe('max-age=31536000')
    expect(securityHeaders(false)).not.toHaveProperty('Strict-Transport-Security')
  })

  it('STE-161: HSTS lasts a year, which is the only value that protects anything', () => {
    // It shipped at 300 seconds for one evening and that was a placebo: the
    // protection only covers a visit following an earlier one inside the
    // max-age, and five minutes expires before the app is next opened. A value
    // shortened back to "be careful" would be careful about nothing.
    const seconds = Number(/max-age=(\d+)/.exec(HSTS)?.[1])
    expect(seconds).toBeGreaterThanOrEqual(2_592_000)
  })

  it('STE-161: HSTS never asks to be preloaded', () => {
    // `preload` is the one thing here that a header change cannot undo — removal
    // means a request to a browser-vendor list — and it buys nothing for a
    // single-user app. Ruled out explicitly, so adding it has to be deliberate.
    expect(HSTS).not.toContain('preload')
  })

  it('STE-161: the policy is enforced, and says so in one header rather than two', () => {
    const headers = securityHeaders(true)
    expect(headers).toHaveProperty('Content-Security-Policy')
    // Sending both is the state that looks safe and is not: a browser obeys the
    // enforcing one and reports against the other, so a policy nobody meant to
    // enforce is enforced while the reports say everything is fine.
    expect(headers).not.toHaveProperty('Content-Security-Policy-Report-Only')
  })

  it('STE-161: an enforced policy still reports, so a missed source is not silent', () => {
    // Enforcing without `report-uri` is the trap: the page simply renders wrong
    // and nothing anywhere says why. `tests/e2e/csp.spec.ts` catches a source
    // this repo can reach; this is what catches one it cannot.
    expect(CONTENT_SECURITY_POLICY).toContain('report-uri /api/csp-report')
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
