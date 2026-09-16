#!/usr/bin/env node
/**
 * The red-team pass (STE-38), against a deployed app.
 *
 * `tests/security/route-surface.test.ts` proves every route is behind a session,
 * in process, on every pull request. **This is the half that needs a real
 * deployment**: response headers, cookie flags, what the platform does with a
 * path, and whether the login's timing still gives an answer away.
 *
 * Not part of `pnpm test`, deliberately — it needs a running app, and it is a
 * measurement rather than an assertion about this repo's source.
 *
 *   node scripts/red-team.mjs                             # https://gaffercalls.com
 *   node scripts/red-team.mjs --url=http://localhost:8787 # a local server
 *
 * **It sends no login codes and creates no accounts.** Every probe below is
 * either a read, a request with a deliberately malformed body, or a request with
 * a forged cookie. The one thing it will not do is ask for a real code: that
 * spends an entry from Stephen's hourly ceiling and puts an email in his inbox,
 * and the criterion it would test is already covered in process.
 *
 * Findings only — never a token, never a key, never an address.
 */

const target = (process.argv.find((a) => a.startsWith('--url=')) ?? '--url=https://gaffercalls.com').split('=')[1]
const BASE = target.replace(/\/+$/, '')

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const note = (name, detail) => {
  results.push({ name, pass: null, detail })
  console.log(`  ..    ${name}${detail ? ` — ${detail}` : ''}`)
}

const get = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init })

console.log(`\nRed-team probes against ${BASE}\n`)

// ---------------------------------------------------------------------------
// 1. What the server tells a stranger about itself.
// ---------------------------------------------------------------------------
{
  const r = await get('/api/health')
  const body = await r.json().catch(() => ({}))

  check('the app is up and reports which commit it is running', r.ok && Boolean(body.commit), `commit ${String(body.commit).slice(0, 7)}`)

  // env is declared as names-and-presence only. A value appearing here would be
  // a secret published to anyone who asks.
  const envShape = JSON.stringify(body.env ?? [])
  const leaks = ['eyJ', 'sk-ant', 'service_role', 'postgres://', 'supabase.co'].filter((s) => envShape.includes(s))
  check('the health endpoint publishes variable names and presence, never values', leaks.length === 0, leaks.length ? `contains ${leaks.join(', ')}` : `${(body.env ?? []).length} variables, shape only`)
}

// ---------------------------------------------------------------------------
// 2. Response headers a browser relies on.
// ---------------------------------------------------------------------------
{
  const r = await get('/')
  const h = (name) => r.headers.get(name)

  // Stated as notes rather than failures where the app has never claimed them:
  // a red-team pass reports what is absent, and whether absence matters is
  // Stephen's call, not this script's.
  const csp = h('content-security-policy')
  const reportOnly = h('content-security-policy-report-only')
  const frame = h('x-frame-options')
  const nosniff = h('x-content-type-options')
  const hsts = h('strict-transport-security')
  const referrer = h('referrer-policy')

  // **Checks rather than notes since STE-161 was ruled.** They were notes while
  // the app had never claimed either header, because a probe that fails by
  // design every time it runs is a gate nobody reads. Both are claimed now, so
  // both must be true.
  check('HTTPS enforced for future visits (HSTS)', Boolean(hsts), hsts ?? 'absent')
  check('the page cannot be framed by another site', Boolean(frame) || Boolean(csp?.includes('frame-ancestors')), frame ?? csp ?? 'absent — clickjacking is not prevented')
  check('content types are not sniffed', nosniff === 'nosniff', nosniff ?? 'absent')
  // **The evidence is the directive the policy's value rests on**, not the whole
  // string — it is ~340 characters and would swamp the line, and a line nobody
  // reads is the same as no line. `script-src` is what would show if the policy
  // ever gained an inline allowance on the live app.
  const policy = csp ?? reportOnly
  const scriptSrc = policy ? (/script-src [^;]+/.exec(policy)?.[0] ?? 'no script-src') : null
  check(
    'a content security policy is stated',
    Boolean(policy),
    policy ? `${String(policy.split(';').length)} directives, ${scriptSrc}` : 'absent',
  )
  check('referrer policy', referrer === 'strict-origin-when-cross-origin', referrer ?? 'absent — full URLs may travel to third parties')

  // **Which mode the policy is in is the finding, not a pass or a fail.** It is
  // deliberately report-only until the reports from real use say the source list
  // is complete (STE-161); printing it is how nobody has to remember that the
  // check above passes either way.
  note('policy mode', csp ? 'enforcing' : reportOnly ? 'report-only — blocking nothing yet' : 'none')
  if (hsts) note('HSTS max-age', `${hsts} — five minutes is deliberate; the undo is that long`)
}

// ---------------------------------------------------------------------------
// 3. The session cookie, and whether a forged one works.
// ---------------------------------------------------------------------------
{
  const r = await get('/api/me', { headers: { Cookie: 'gaffer_session=forged-value-that-is-not-a-session' } })
  check('a forged session cookie is refused', r.status === 401, `HTTP ${r.status}`)

  const empty = await get('/api/me')
  check('no cookie at all is refused', empty.status === 401, `HTTP ${empty.status}`)

  // The flags are asserted in process against cookieHeader(); this confirms the
  // deployed app actually emits them, which depends on x-forwarded-proto and has
  // cost a production defect before.
  const out = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', redirect: 'manual' })
  const cookie = out.headers.get('set-cookie') ?? ''
  check('the session cookie is HttpOnly, Secure and SameSite on the real deployment',
    /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite/i.test(cookie),
    cookie ? cookie.replace(/=[^;]*/, '=<redacted>') : 'no Set-Cookie returned')
}

// ---------------------------------------------------------------------------
// 4. Paths a stranger might try.
// ---------------------------------------------------------------------------
{
  // The SPA fallback answers unknown paths with index.html. What it must never
  // do is answer with a file from the server's own disk.
  const traversals = [
    '/../.env',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/.env',
    '/apps/server/.env',
    '/.git/config',
    '/dist/index.js.map',
  ]
  const served = []
  for (const path of traversals) {
    const r = await get(path)
    const text = await r.text().catch(() => '')
    // index.html is the correct answer; anything carrying a key shape is not.
    if (/SUPABASE|SERVICE_KEY|sk-ant|BEGIN [A-Z ]*PRIVATE KEY|eyJhbGciOi/i.test(text)) served.push(`${path} → ${r.status}`)
  }
  check('no path returns a secret or a dotfile', served.length === 0, served.length ? served.join(', ') : `${traversals.length} paths tried, all inert`)

  const unknownApi = await get('/api/definitely-not-a-route')
  check('an unknown API path is a JSON 404, not the app shell', unknownApi.status === 404, `HTTP ${unknownApi.status}`)
}

// ---------------------------------------------------------------------------
// 5. The enumeration oracle — the reason slice 10 existed.
// ---------------------------------------------------------------------------
{
  // **Two addresses that certainly have no account.** Measured on 2026-09-08 this
  // route took 3.46s for an address with an account and 0.045s for one without,
  // because the send was awaited. It is not awaited now, so every path should be
  // one database round trip — and two *unknown* addresses are enough to show the
  // floor, without spending a real code.
  //
  // This cannot prove the known-address case without sending an email, so it is
  // reported as a measurement rather than a pass: what it catches is a
  // regression that makes request-code slow again.
  const times = []
  for (const email of [`nobody-${Date.now()}@example.invalid`, `nobody2-${Date.now()}@example.invalid`]) {
    const started = performance.now()
    const r = await fetch(`${BASE}/api/auth/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const ms = Math.round(performance.now() - started)
    const body = await r.text()
    times.push({ ms, status: r.status, body })
  }

  const sameAnswer = times.every((t) => t.status === times[0].status && t.body === times[0].body)
  check('every login submission returns the same bytes', sameAnswer, times.map((t) => `${t.status} ${t.body}`).join(' | '))
  note('login response time, unknown addresses', `${times.map((t) => `${t.ms}ms`).join(', ')} — was 3460ms for an address with an account before the send stopped being awaited`)

  const slow = times.filter((t) => t.ms > 1500)
  check('no login submission waits on an email being sent', slow.length === 0, slow.length ? `${slow.map((t) => `${t.ms}ms`).join(', ')} — the send may be awaited again` : 'all well under a second')
}

// ---------------------------------------------------------------------------
// 6. Bodies the routes were not expecting.
// ---------------------------------------------------------------------------
{
  const nasty = [
    ['a body that is not JSON at all', 'not json'],
    ['a JSON array where an object was expected', '[]'],
    ['a null body', 'null'],
    ['an enormous string', JSON.stringify({ email: `${'a'.repeat(100_000)}@example.invalid` })],
    ['a nested object where a string was expected', JSON.stringify({ email: { toString: 'nope' } })],
  ]
  const crashed = []
  for (const [name, body] of nasty) {
    for (const path of ['/api/auth/request-code', '/api/auth/verify']) {
      const r = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (r.status >= 500) crashed.push(`${path} with ${name} → ${r.status}`)
    }
  }
  check('no malformed body reaches an unhandled error', crashed.length === 0, crashed.length ? crashed.join(', ') : `${nasty.length * 2} requests, none 5xx`)
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => r.pass === false)
const passed = results.filter((r) => r.pass === true)
console.log(`\n${passed.length}/${passed.length + failed.length} checks passed` +
  (results.some((r) => r.pass === null) ? `, ${results.filter((r) => r.pass === null).length} reported without a verdict` : ''))
if (failed.length) {
  console.log('\nFailures:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
console.log('')
