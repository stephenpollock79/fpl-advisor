/**
 * The headers every response carries, and the two that took a ruling (STE-161).
 *
 * Split out of `index.ts` so the values can be asserted directly rather than
 * through a booted server: a header that stops being sent is exactly the kind of
 * regression nothing notices, because the app goes on working.
 */

/**
 * **Enforcing, on evidence rather than on a wait.**
 *
 * It shipped report-only because nothing in this repo could say whether the list
 * below was complete — the browser suite runs against the Vite dev server, which
 * sends no headers at all — and the plan was to collect violation reports from a
 * phone over several days. `tests/e2e/csp.spec.ts` replaced that wait: it serves
 * the production build through this very function and walks the app with a real
 * browser listening for what the policy refuses. Nothing is refused, and the
 * test goes red for a real omission — proved by deleting the font host and
 * watching four typefaces fail.
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
 * - `'unsafe-inline'` on styles only. **It is probably unnecessary, and it stays
 *   anyway.** The two components that set a `style` prop — a club's kit colours
 *   and the drag transform — go through React, which writes each property via
 *   the CSSOM rather than emitting a `style` attribute for the parser, and CSP
 *   does not police the CSSOM. Adding `style-src-attr 'none'` produced no
 *   violation anywhere in the walk, which is the measurement. Tightening it is
 *   still a separate change from enforcing the policy: one of those two is
 *   backed by evidence and the other would be riding on it (STE-173).
 *   Scripts get no such allowance: the production build emits a file and no
 *   inline script, which is what makes `script-src 'self'` the line that carries
 *   this policy's whole value.
 * - `data:` on images for icons inlined by the build.
 *
 * **PostHog is deliberately absent.** STE-161 said this policy would have to
 * name it; the client has never loaded it (STE-35 was cancelled), so naming it
 * would permit a source nothing uses.
 *
 * **The report route stays.** `report-uri` is honoured in enforcing mode too, so
 * the day a source is added and forgotten, the failure arrives as a line in the
 * log rather than as a screen that renders wrong on a phone.
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
 * **A year, and never `preload`.** Ruled by Stephen 2026-09-16.
 *
 * This is the one header a browser remembers, so it is the only thing here that
 * cannot be taken back with a deploy.
 *
 * **It went out at 300 seconds for one evening, and that was a placebo.** The
 * protection only applies to a visit that follows an earlier one inside the
 * max-age; at five minutes it had expired before the app was next opened. The
 * real choice was a year or nothing.
 *
 * **What the year actually costs, stated properly, because it was overstated
 * first.** The only thing that can break is the certificate — Railway issues and
 * renews it, and no deploy from here can affect it. If it ever failed, the app
 * is unreachable either way; this header removes the option of clicking past the
 * browser's warning and using it over a broken connection. **The lockout lasts
 * as long as the outage, not as long as the max-age** — the app is reachable
 * again the moment the certificate is. The max-age only bites if the app were
 * deliberately moved somewhere that could not serve https at all.
 *
 * `preload` is the genuinely permanent one — removal means a request to a
 * browser-vendor list rather than a header change — and it buys nothing for a
 * single-user app. There is a test that it never appears.
 */
export const HSTS = 'max-age=31536000'

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
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    ...(isSecure ? { 'Strict-Transport-Security': HSTS } : {}),
  }
}
