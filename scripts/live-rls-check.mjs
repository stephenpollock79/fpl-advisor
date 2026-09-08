#!/usr/bin/env node
/**
 * The live half of STE-58, against fpl-advisor-dev.
 *
 * tests/rls/isolation.test.ts proves the migrations isolate. It cannot prove the
 * project has them applied, or that PostgREST and the grants behave as expected
 * on the real path. This does: it creates two throwaway accounts, signs in as
 * each for real, and tries to read the other's rows over HTTP exactly as the
 * server does — then deletes both accounts.
 *
 * Not part of `pnpm test`, deliberately. It needs credentials and it writes to a
 * real project, so it is run on demand rather than on every pull request.
 *
 *   node scripts/live-rls-check.mjs                 # dev, from apps/server/.env
 *   node scripts/live-rls-check.mjs --project=prod  # prod, keys fetched via the CLI
 *
 * **It creates two accounts and deletes them**, so targeting prod is a deliberate
 * act and never a default. Naming the project explicitly is that act; there is no
 * way to reach prod by leaving something unset.
 *
 * Prod credentials are read from the Supabase CLI rather than from a file, so
 * they are never written into `apps/server/.env` — an env file left pointing at
 * prod is exactly the quiet mistake this project keeps designing against.
 *
 * Prints findings only — never a key, never a token.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PROJECTS = {
  dev: 'wtzdzjvvefbcgxdfxqom',
  prod: 'bibsndkwgrnsklnzckim',
}

const target = (process.argv.find((a) => a.startsWith('--project=')) ?? '--project=dev').split('=')[1]
if (!(target in PROJECTS)) {
  throw new Error(`Unknown --project=${target}. Known: ${Object.keys(PROJECTS).join(', ')}.`)
}

let URL_, ANON, SVC
const ref = PROJECTS[target]

if (target === 'dev') {
  const ENV_FILE = fileURLToPath(new URL('../apps/server/.env', import.meta.url))
  const env = Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
  URL_ = (env['SUPABASE_URL'] ?? '').replace(/\/+$/, '')
  ANON = env['SUPABASE_ANON_KEY']
  SVC = env['SUPABASE_SERVICE_KEY']
  if (!URL_ || !ANON || !SVC) throw new Error('apps/server/.env is missing Supabase values')

  const envRef = URL_.split('//')[1].split('.')[0]
  if (envRef !== ref) {
    throw new Error(
      `Refusing to run: apps/server/.env points at ${envRef}, not the dev project ${ref}.`,
    )
  }
} else {
  // Fetched, not stored. Nothing here writes a prod key to disk.
  const keys = JSON.parse(
    execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    }),
  )
  URL_ = `https://${ref}.supabase.co`
  ANON = keys.find((k) => k.name === 'anon')?.api_key
  SVC = keys.find((k) => k.name === 'service_role')?.api_key
  if (!ANON || !SVC) throw new Error(`Could not read API keys for ${ref}.`)
  console.log(`\n  ******  TARGETING PRODUCTION (${ref})  ******`)
  console.log('  Two accounts will be created and deleted. Cleanup is verified below.\n')
}

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const admin = (path, init = {}) =>
  fetch(`${URL_}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', ...init.headers },
  })

const rest = (path, token, key, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })

async function createUser(email) {
  const r = await admin('admin/users', {
    method: 'POST',
    // email_confirm true, and no password field at all: STE-51 is explicit that
    // setting a password makes F7-AC-03 silently false, and the dashboard's
    // Add-user dialog requires one.
    body: JSON.stringify({ email, email_confirm: true }),
  })
  const body = await r.json()
  if (!r.ok) throw new Error(`create ${email}: ${r.status} ${JSON.stringify(body)}`)
  return body.id
}

async function signIn(email) {
  // generate_link yields the same one-time code the email would carry, without
  // sending one — so this check does not consume the 60s per-address interval
  // that the real OTP test needs.
  const g = await admin('admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const link = await g.json()
  if (!g.ok) throw new Error(`generate_link ${email}: ${g.status} ${JSON.stringify(link)}`)

  const v = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token: link.email_otp }),
  })
  const session = await v.json()
  if (!v.ok || !session.access_token) throw new Error(`verify ${email}: ${v.status}`)
  return session.access_token
}

const deleteUser = (id) => admin(`admin/users/${id}`, { method: 'DELETE' })

const stamp = Date.now()
const A = { email: `rls-check-a-${stamp}@gaffercalls.com` }
const B = { email: `rls-check-b-${stamp}@gaffercalls.com` }

console.log(`\nLive RLS check against ${ref} (${target})\n`)

try {
  A.id = await createUser(A.email)
  B.id = await createUser(B.email)
  check('two throwaway accounts created without passwords', true, `${A.id.slice(0, 8)}…, ${B.id.slice(0, 8)}…`)

  A.token = await signIn(A.email)
  B.token = await signIn(B.email)
  check('both signed in with a one-time code, no password', true)

  // Each writes its own row, as itself. The first write in the product goes
  // through the policies rather than round them.
  for (const u of [A, B]) {
    const r = await rest('manager', u.token, ANON, {
      method: 'POST',
      body: JSON.stringify({ user_id: u.id }),
      headers: { Prefer: 'return=representation' },
    })
    if (!r.ok) throw new Error(`insert own row: ${r.status} ${await r.text()}`)
  }
  check('each user can insert its own row', true)

  // --- the actual question -------------------------------------------------
  const aSees = await (await rest('manager?select=user_id', A.token, ANON)).json()
  check(
    'F7-AC-11: user A reads only its own row',
    Array.isArray(aSees) && aSees.length === 1 && aSees[0].user_id === A.id,
    `saw ${Array.isArray(aSees) ? aSees.length : '?'} row(s)`,
  )

  const aTargetsB = await (await rest(`manager?select=user_id&user_id=eq.${B.id}`, A.token, ANON)).json()
  check(
    "F7-AC-11: user A asking for B's row by id gets nothing",
    Array.isArray(aTargetsB) && aTargetsB.length === 0,
    'the filter is not the protection — the policy is',
  )

  const aUpdatesB = await rest(`manager?user_id=eq.${B.id}`, A.token, ANON, {
    method: 'PATCH',
    body: JSON.stringify({ team_name: 'owned by A' }),
    headers: { Prefer: 'return=representation' },
  })
  const updated = aUpdatesB.ok ? await aUpdatesB.json() : []
  check(
    "F7-AC-11: user A cannot write B's row",
    Array.isArray(updated) && updated.length === 0,
    `${updated.length} row(s) changed`,
  )

  const aStealsIdentity = await rest('manager', A.token, ANON, {
    method: 'POST',
    body: JSON.stringify({ user_id: B.id, team_name: 'A pretending to be B' }),
  })
  check(
    'F7-AC-11: user A cannot insert a row owned by B',
    !aStealsIdentity.ok,
    `HTTP ${aStealsIdentity.status}`,
  )

  const anonRead = await rest('manager?select=user_id', ANON, ANON)
  check('F7-AC-11: a signed-out visitor reads nothing', !anonRead.ok, `HTTP ${anonRead.status}`)

  const svcRead = await rest('manager?select=user_id', SVC, SVC)
  check(
    'ADR 0007: the service key cannot reach user data at all',
    svcRead.status === 403,
    `HTTP ${svcRead.status} — withheld by grant, on purpose`,
  )

  const svcSession = await rest('app_session?select=id', SVC, SVC)
  check('the server can still read its own session table', svcSession.ok, `HTTP ${svcSession.status}`)
} finally {
  for (const u of [A, B]) {
    if (u.id) {
      const r = await deleteUser(u.id)
      console.log(`  ${r.ok ? 'cleaned up' : 'FAILED TO DELETE'} ${u.email}`)
    }
  }

  // Deleting and believing the delete are different things, and a stray account
  // on prod is exactly what invite-only exists to prevent. Ask, do not assume.
  const after = await (await admin('admin/users?per_page=100')).json()
  const strays = (after.users ?? []).filter((u) => u.email?.startsWith('rls-check-'))
  check('both throwaway accounts are gone', strays.length === 0, strays.map((u) => u.email).join(', '))
  console.log(`  accounts remaining on ${target}: ${(after.users ?? []).length}`)
  for (const u of after.users ?? []) console.log(`    ${u.email}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`)
process.exitCode = failed.length ? 1 : 0
