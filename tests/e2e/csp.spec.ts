/**
 * **The one check nothing else in this repo can make** (STE-161).
 *
 * Every other browser flow runs against the Vite dev server, which sends none of
 * the security headers — so a page whose fonts, styles or bundle were refused by
 * the content-security-policy would pass all sixty of them. That gap is why the
 * policy shipped report-only: the evidence had to come from a real browser on
 * real screens, and the plan was to wait days for violation reports from a
 * phone.
 *
 * It does not have to be days. This serves **the production build**, through
 * **the server's own header function**, and walks the app with a real browser
 * listening for the event the policy fires. A violation here is the same
 * violation the phone would have reported, found in seconds and across screens
 * that are rarely opened.
 *
 * **It cannot cover what needs a signed-in session** — those screens are reached
 * through the fixture's intercepted world, which is exactly what the flows
 * already do, so they are covered. What is genuinely out of reach is a real
 * `/api` response over the network, and `connect-src 'self'` is the directive
 * that governs it — same origin either way.
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { expect, test } from '@playwright/test'
import { securityHeaders } from '../../apps/server/src/security-headers.js'
import { open, world } from './fixture'

const DIST = new URL('../../apps/client/dist/', import.meta.url).pathname
const PORT = 5198

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

let server: ReturnType<typeof createServer>

test.use({ baseURL: `http://localhost:${String(PORT)}` })

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, 'index.html')), 'run `pnpm --filter @fpl/client build` first')

  server = createServer((req, res) => {
    // **The real function, not a copy of its output.** A second copy of the
    // policy here would pass this test for ever while the deployed one drifted.
    for (const [name, value] of Object.entries(securityHeaders(true))) res.setHeader(name, value)

    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'))
    const file = join(DIST, path)
    // The SPA fallback the server does, so a deep link renders the app rather
    // than a 404 with no policy on it.
    const target = path !== '/' && existsSync(file) && extname(file) ? file : join(DIST, 'index.html')
    res.setHeader('Content-Type', TYPES[extname(target)] ?? 'application/octet-stream')
    res.end(readFileSync(target))
  })
  await new Promise<void>((resolve) => server.listen(PORT, resolve))
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => { resolve() }))
})

/** Whatever the policy refused, in the browser's own words. */
type Violation = { directive: string; blocked: string }

test('STE-161: the policy refuses nothing the app actually loads', async ({ page }) => {
  const violations: Violation[] = []
  await page.exposeFunction('__cspViolation', (v: Violation) => violations.push(v))
  // **A string, not a function.** This file compiles under `lib: ES2022` with no
  // DOM — the same narrow setting that keeps `window` out of the engine — so the
  // listener is handed over as source rather than type-checked against globals
  // this project deliberately does not declare.
  await page.addInitScript({
    content: `document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolation({ directive: e.effectiveDirective, blocked: e.blockedURI })
    })`,
  })

  // The signed-out screen first: it loads the bundle, the stylesheet and both
  // font hosts, which is most of the policy's surface in one page.
  await page.route('**/api/me', (r) => r.fulfill({ status: 401, json: { error: 'not_signed_in' } }))
  await page.goto('/')
  await page.getByRole('tab', { name: /log in/i }).click()
  await page.unrouteAll()

  // Then the screens behind a session, through the fixture's world. **Both
  // components that set a `style` prop are on this walk** — the kit colours on
  // the Overview's mini pitches, and the drag transform on the head-to-head —
  // which is what licensed dropping `'unsafe-inline'` from `style-src`
  // (STE-173). If either ever does emit a real style attribute, it reports
  // here rather than on a phone.
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await page.getByRole('tab', { name: 'Stat', exact: true }).click()
  await page.getByRole('tab', { name: 'Assistant' }).click()
  await page.getByTestId('tab-transfer').click()
  await page.getByRole('button', { name: /how this was calculated/i }).click()
  await page.getByRole('button', { name: /account/i }).first().click()

  await page.waitForTimeout(600)

  expect(
    violations,
    'the content-security-policy would have refused these. Each one is either a source the policy ' +
      'has to name, or something the app should not be loading — and it must be settled before ' +
      'the header is flipped from report-only to enforcing (STE-161).',
  ).toEqual([])

  // Without this the test passes vacuously the day the listener stops firing,
  // and a green run would read as "the policy is clean" when it means nothing
  // was watching.
  const watching = await page.evaluate('typeof window.__cspViolation')
  expect(watching, 'nothing was listening, so an empty violation list proves nothing').toBe('function')
})
