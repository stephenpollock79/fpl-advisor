#!/usr/bin/env node
/**
 * The live half of STE-58, extended to every user table by STE-108.
 *
 * tests/rls/isolation.test.ts proves the migrations isolate. It cannot prove the
 * project has them applied, or that PostgREST and the grants behave as expected
 * on the real path. This does: it creates two throwaway accounts, signs in as
 * each for real, and tries to read the other's rows over HTTP exactly as the
 * server does — then deletes both accounts.
 *
 * **The table list is discovered, never named here.** It is read from the posture
 * comments in the migrations, the same source the pglite suite classifies by, so
 * a slice that adds a user table cannot leave this check silently behind. That
 * was the STE-108 failure: this script used to query `manager` and nothing else,
 * so after slice 3 it passed 11/11 while covering neither squad table.
 *
 * A user table with no seed recipe below **fails** rather than being skipped. A
 * skip is how a check quietly stops covering the thing it was written for.
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
import { readFileSync, readdirSync } from 'node:fs'
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

// --- which tables hold user data -------------------------------------------
//
// Read from the migrations rather than listed here, so this file cannot fall
// behind a migration. `pg_class` is not reachable over PostgREST, so the posture
// comments are parsed from source instead of queried from the live project —
// sound only because schema changes never happen through the console (CLAUDE.md),
// so the migrations are the schema. The cross-check further down closes the
// remaining gap by asking the project itself what it exposes.

const MIGRATIONS = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const postures = new Map()
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(MIGRATIONS + file, 'utf8')
  for (const m of sql.matchAll(/comment\s+on\s+table\s+public\.(\w+)\s+is\s+'posture:(\w+)/gi)) {
    postures.set(m[1], m[2])
  }
}
const declaredUserTables = [...postures].filter(([, p]) => p === 'user').map(([t]) => t)

// Order matters and alphabetical order is wrong: squad_player hangs off a
// snapshot, and sorting by name would write the child first. SEEDS is declared
// in dependency order, so that is the order used, with anything it does not know
// about appended — those fail the recipe check below rather than running.
const orderUserTables = (tables) => {
  const known = Object.keys(SEEDS).filter((t) => tables.includes(t))
  return [...known, ...tables.filter((t) => !known.includes(t))]
}

// --- how to put one row in each ---------------------------------------------
//
// Every user table needs a row of A's and a row of B's before "A cannot see B's"
// means anything. The recipes are explicit because the rows are not
// interchangeable: squad_player's owner is pinned to its snapshot by a composite
// foreign key, so it has to be written after one.
//
// `patch` is a harmless column to aim an update at when testing that A cannot
// write B's row. It is never read back for its value, only for the row count.

const SEEDS = {
  manager: {
    row: (ctx) => ({ user_id: ctx.userId }),
    patch: { team_name: 'owned by the other user' },
  },
  squad_snapshot: {
    row: (ctx) => ({
      user_id: ctx.userId,
      gameweek: ctx.gameweekId,
      source: 'fpl_deadline',
      bank_tenths: 0,
      free_transfers: 1,
      chips_remaining: { wildcard: 'available', freehit: 'available', bboost: 'available', '3xc': 'available' },
    }),
    // The insert returns the id squad_player then hangs off.
    capture: (body, ctx) => { ctx.snapshotId = body?.[0]?.id },
    patch: { bank_tenths: 999 },
  },
  squad_player: {
    row: (ctx) => ({
      snapshot_id: ctx.snapshotId,
      user_id: ctx.userId,
      player_id: ctx.playerId,
      is_starter: true,
      bench_order: null,
    }),
    patch: { is_captain: true },
  },
  run: {
    row: (ctx) => ({ user_id: ctx.userId, gameweek: ctx.gameweekId, status: 'succeeded' }),
    // The insert returns the id call then hangs off, pinned by the pair key.
    capture: (body, ctx) => { ctx.runId = body?.[0]?.id },
    patch: { status: 'failed' },
  },
  call: {
    row: (ctx) => ({
      user_id: ctx.userId,
      run_id: ctx.runId,
      gameweek: ctx.gameweekId,
      call_key: 'rls-check',
      category: 'transfer',
      shape: 'transfer',
      out_player_id: ctx.playerId,
      in_player_id: ctx.playerId,
      net: 1,
      conviction: 33,
      band: 'thin',
      k_used: 2,
      reasoning: 'rls check',
      reasoning_source: 'template',
      breakdown: {},
      position: 0,
    }),
    patch: { reasoning: 'owned by the other user' },
  },
  decision: {
    row: (ctx) => ({ user_id: ctx.userId, gameweek: ctx.gameweekId, call_key: 'rls-check', state: 'selected' }),
    patch: { state: 'rejected' },
  },
}

const userTables = orderUserTables(declaredUserTables)
const unrecipied = userTables.filter((t) => !(t in SEEDS))
const stamp = Date.now()
const A = { email: `rls-check-a-${stamp}@gaffercalls.com`, ctx: {} }
const B = { email: `rls-check-b-${stamp}@gaffercalls.com`, ctx: {} }

/**
 * Borrow an existing reference id. **Never creates one.**
 *
 * The obvious shortcut is to insert a throwaway gameweek and player when the
 * project has none. It was tried on prod on 2026-09-09 and left three rows
 * behind, because the reference tables grant the service key `select, insert,
 * update` and deliberately no `delete` — ingestion upserts and never removes, so
 * nothing this script holds can undo its own seeding. Adding a delete grant to
 * make a test tidier would weaken a real constraint for the convenience of the
 * thing checking it.
 *
 * So a project without reference data cannot be verified for the tables that
 * depend on it, and this says so and fails. It does not skip: a skip is how this
 * check came to cover one table while reporting a clean run.
 */
async function referenceId(table, select) {
  const r = await rest(`${table}?select=${select}&limit=1`, SVC, SVC)
  const rows = r.ok ? await r.json() : []
  return Array.isArray(rows) && rows.length ? rows[0][select] : null
}

console.log(`\nLive RLS check against ${ref} (${target})\n`)
console.log(`  user-posture tables found in the migrations: ${userTables.join(', ')}\n`)

try {
  // A user table nobody taught this script about is a failure, not a skip. The
  // whole of STE-108 is that a check which quietly covers less than it claims is
  // worse than no check, because the pass stops anyone looking.
  check(
    'every user-posture table has a seed recipe here, so none is silently skipped',
    unrecipied.length === 0 && userTables.length > 0,
    unrecipied.length
      ? `no recipe for ${unrecipied.join(', ')} — add one to SEEDS`
      : `${userTables.length} table(s)`,
  )
  if (unrecipied.length || userTables.length === 0) {
    throw new Error('cannot continue without covering every user table')
  }

  // squad_snapshot points at a gameweek and squad_player at a player, so both
  // have to already exist on the project. A project with no reference data has
  // not been ingested, and the app does not work there either — so this is a
  // real "cannot verify", not a technicality to wave through.
  const gameweekId = await referenceId('gameweek', 'id')
  const playerId = await referenceId('player', 'id')
  const missing = [gameweekId === null && 'gameweek', playerId === null && 'player'].filter(Boolean)
  check(
    'the reference data the user tables point at is present on this project',
    missing.length === 0,
    missing.length
      ? `${missing.join(' and ')} empty — run an ingest against ${target} first; squad_snapshot and squad_player cannot be exercised without it`
      : 'gameweek and player both populated',
  )
  if (missing.length) throw new Error(`cannot verify ${target} until it has reference data`)

  A.id = await createUser(A.email)
  B.id = await createUser(B.email)
  check('two throwaway accounts created without passwords', true, `${A.id.slice(0, 8)}…, ${B.id.slice(0, 8)}…`)

  A.token = await signIn(A.email)
  B.token = await signIn(B.email)
  check('both signed in with a one-time code, no password', true)

  for (const u of [A, B]) Object.assign(u.ctx, { userId: u.id, gameweekId, playerId })

  // Each writes its own row in every user table, as itself. The first write in
  // the product goes through the policies rather than round them.
  for (const table of userTables) {
    for (const u of [A, B]) {
      const r = await rest(table, u.token, ANON, {
        method: 'POST',
        body: JSON.stringify(SEEDS[table].row(u.ctx)),
        headers: { Prefer: 'return=representation' },
      })
      if (!r.ok) throw new Error(`insert own row in ${table}: ${r.status} ${await r.text()}`)
      SEEDS[table].capture?.(await r.json(), u.ctx)
    }
    check(`${table}: each user can insert its own row`, true)
  }

  // --- the actual question, for every user table ---------------------------
  for (const table of userTables) {
    const aSees = await (await rest(`${table}?select=user_id`, A.token, ANON)).json()
    check(
      `F7-AC-11 · ${table}: user A reads only its own rows`,
      Array.isArray(aSees) && aSees.length > 0 && aSees.every((r) => r.user_id === A.id),
      `saw ${Array.isArray(aSees) ? aSees.length : '?'} row(s)`,
    )

    const aTargetsB = await (await rest(`${table}?select=user_id&user_id=eq.${B.id}`, A.token, ANON)).json()
    check(
      `F7-AC-11 · ${table}: user A asking for B's rows by id gets nothing`,
      Array.isArray(aTargetsB) && aTargetsB.length === 0,
      'the filter is not the protection — the policy is',
    )

    const aUpdatesB = await rest(`${table}?user_id=eq.${B.id}`, A.token, ANON, {
      method: 'PATCH',
      body: JSON.stringify(SEEDS[table].patch),
      headers: { Prefer: 'return=representation' },
    })
    const updated = aUpdatesB.ok ? await aUpdatesB.json() : []
    check(
      `F7-AC-11 · ${table}: user A cannot write B's rows`,
      Array.isArray(updated) && updated.length === 0,
      `${updated.length} row(s) changed`,
    )

    const aStealsIdentity = await rest(table, A.token, ANON, {
      method: 'POST',
      body: JSON.stringify({ ...SEEDS[table].row(B.ctx), user_id: B.id }),
    })
    check(
      `F7-AC-11 · ${table}: user A cannot insert a row owned by B`,
      !aStealsIdentity.ok,
      `HTTP ${aStealsIdentity.status}`,
    )

    const anonRead = await rest(`${table}?select=user_id`, ANON, ANON)
    check(`F7-AC-11 · ${table}: a signed-out visitor reads nothing`, !anonRead.ok, `HTTP ${anonRead.status}`)

    const svcRead = await rest(`${table}?select=user_id`, SVC, SVC)
    check(
      `ADR 0007 · ${table}: the service key cannot reach user data at all`,
      svcRead.status === 403,
      `HTTP ${svcRead.status} — withheld by grant, on purpose`,
    )
  }

  // The list above is only as complete as the migrations, so this asks the live
  // project what it actually holds and fails on anything the migrations never
  // declared — a table added through the console, which the conventions forbid
  // and nothing else would notice.
  //
  // **It sees what the service key sees, which excludes every user table** —
  // Supabase serves this endpoint to secret keys only, and ADR 0007 withholds
  // that key's grant on user data. So a user table created outside a migration
  // would still be invisible here. Stated rather than glossed: this closes the
  // reference and service side of the gap and not the user side.
  const schema = await (await rest('', SVC, SVC)).json()
  const exposed = Object.keys(schema?.definitions ?? {}).filter((t) => t && !t.startsWith('rpc/'))
  const undeclared = exposed.filter((t) => !postures.has(t))
  check(
    'the project holds no reference or service table the migrations did not create',
    exposed.length > 0 && undeclared.length === 0,
    exposed.length === 0
      ? 'PostgREST advertised nothing — the cross-check could not run'
      : undeclared.length
        ? `on the project but in no migration: ${undeclared.join(', ')}`
        : `${exposed.length} table(s) exposed to the service key, all declared`,
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

  // The rows in every user table cascade from the deleted accounts, by foreign
  // key. That is asserted where it can be — in the pglite suite — and NOT
  // checked here on purpose: ADR 0007 withholds the service key's grant on user
  // data, so nothing this script holds is able to look. A check that always
  // skips would read like coverage and provide none, which is the STE-108
  // mistake in miniature.

  console.log(`  accounts remaining on ${target}: ${(after.users ?? []).length}`)
  for (const u of after.users ?? []) console.log(`    ${u.email}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`)
process.exitCode = failed.length ? 1 : 0

// --- account helpers, hoisted so the run above reads top to bottom ----------

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

function deleteUser(id) {
  return admin(`admin/users/${id}`, { method: 'DELETE' })
}
