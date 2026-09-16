/**
 * The headers every response carries, and the two that took a ruling (STE-161).
 *
 * Split out of `index.ts` so the values can be asserted directly rather than
 * through a booted server: a header that stops being sent is exactly the kind of
 * regression nothing notices, because the app goes on working.
 */

/**
 * **Report-only, for now.** The browser evaluates this and reports what it would
 * have refused, while refusing nothing — so it cannot take the app away before
 * Friday's deadline. It is flipped to `Content-Security-Policy` once the reports
 * from a few days of real use say the list below is complete.
 *
 * What each source is actually for, so nobody has to guess when one has to move:
 *
 * - `'self'` covers the bundle, the stylesheet, the icons and every `/api` call.
 *   The client is same-origin with the server by design (ADR 0005), which is why
 *   `connect-src` needs nothing else.
 * - **Google Fonts is two hosts, not one.** `fonts.googleapis.com` serves the
 *   stylesheet and `fonts.gstatic.com` serves the font files; naming only the
 *   first is the classic mistake, and the page then renders in a fallback face
 *   with nothing in the console but a font error.
 * - `'unsafe-inline'` on styles only, because two components set a `style`
 *   attribute — a club's kit colours and the drag transform — and a style
 *   attribute is governed by this list. Scripts get no such allowance: the
 *   production build emits a file and no inline script, which is what makes
 *   `script-src 'self'` the line that carries this policy's whole value.
 * - `data:` on images for icons inlined by the build.
 *
 * **PostHog is deliberately absent.** STE-161 said this policy would have to
 * name it; the client has never loaded it (STE-35 was cancelled), so naming it
 * would permit a source nothing uses.
 *
 * **Nothing in this repo can tell you whether the list is right.** The browser
 * suite runs against the Vite dev server, which never sends these headers, so a
 * page whose fonts were silently refused would pass every flow. That is the
 * whole reason the policy ships report-only with somewhere to report to: the
 * evidence has to come from a real browser on real screens, and then the header
 * name changes by one word.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'report-uri /api/csp-report',
].join('; ')

/**
 * **Five minutes, not a year, and never `preload`.**
 *
 * This is the one header on the list a browser remembers. It refuses plain http
 * to this host for `max-age` seconds whatever the server later says, so at the
 * usual year a certificate problem stops being a warning and becomes a site
 * nobody can reach until the year is up. At 300 seconds the undo is: stop
 * sending it, and every browser forgets within five minutes of its last visit.
 *
 * `preload` is permanent in a way no max-age is — removal means a request to a
 * browser-vendor list — and buys nothing for a single-user app.
 *
 * Raise this once it has been live through a quiet week (STE-161).
 */
export const HSTS = 'max-age=300'

/**
 * What every response carries.
 *
 * `isSecure` gates HSTS alone: a browser ignores it over http anyway, and
 * sending it from a local dev server would be claiming something about
 * `localhost` that nobody meant.
 */
export function securityHeaders(isSecure: boolean): Record<string, string> {
  return {
    // The app is never framed. Without this, anyone can put gaffercalls.com in
    // an invisible iframe over their own page and collect the taps.
    'X-Frame-Options': 'DENY',
    // Stops a browser second-guessing a Content-Type and executing something we
    // served as data.
    'X-Content-Type-Options': 'nosniff',
    // Full URLs stop travelling to other origins. Nothing here puts anything
    // sensitive in a path today, and this is what keeps that true by accident
    // rather than by vigilance.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY,
    ...(isSecure ? { 'Strict-Transport-Security': HSTS } : {}),
  }
}
