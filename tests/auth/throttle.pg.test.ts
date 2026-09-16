/**
 * The rate limits, against the real migration.
 *
 * `tests/auth/request-code.test.ts` drives the routes over an in-memory store,
 * which is fast and proves the routes. **It cannot prove the thing that actually
 * enforces the limit**, because that is a SQL function. This file runs the
 * migration into real Postgres and calls the same function the server calls,
 * under the same grants the migration sets.
 *
 * Every test drives the clock through `p_now` rather than sleeping, so a window
 * that is an hour long costs no wall time.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { type TestDb, freshDb } from '../rls/harness.js'

let db: TestDb

const T0 = '2026-09-16T12:00:00Z'
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString()

/** One ask, shaped as the server shapes it. Subjects are digests in production; any string does here. */
const ask = (kind: string, subject: string, limit: number, windowSeconds: number) => ({
  kind,
  subject,
  limit,
  windowSeconds,
})

async function take(asks: ReturnType<typeof ask>[], now: string): Promise<boolean> {
  const rows = await db.as<{ allowed: boolean }>(
    'service_role',
    null,
    `select public.auth_throttle_take(
       '${JSON.stringify(asks)}'::jsonb,
       '${now}'::timestamptz
     ) as allowed`,
  )
  return rows[0]!.allowed
}

async function hitsFor(kind: string, subject: string): Promise<number | null> {
  const rows = await db.as<{ hits: number }>(
    'service_role',
    null,
    `select hits from public.auth_throttle where kind = '${kind}' and subject_hash = '${subject}'`,
  )
  return rows[0]?.hits ?? null
}

beforeEach(async () => {
  db = await freshDb()
})

describe('F7-AC-06 · the rate limits, in the database that enforces them', () => {
  it('F7-AC-06: a second request inside sixty seconds is denied, and a later one is allowed', async () => {
    const minute = [ask('address_minute', 'subject-a', 1, 60)]

    expect(await take(minute, at(0))).toBe(true)
    // The trigger is the second request actually being made inside the window,
    // not a counter set to 1 by hand.
    expect(await take(minute, at(59))).toBe(false)
    expect(await take(minute, at(61))).toBe(true)
  })

  it('F7-AC-06: a sixth request in an hour is denied, at five per address', async () => {
    const hour = [ask('address_hour', 'subject-a', 5, 3600)]

    // Five real requests, spaced past the minute limit so only the ceiling can bite.
    for (let n = 0; n < 5; n += 1) {
      expect(await take(hour, at(n * 70))).toBe(true)
    }
    expect(await take(hour, at(5 * 70))).toBe(false)
  })

  it('F7-AC-06: the hourly window rolls, so a denied subject is allowed again', async () => {
    const hour = [ask('address_hour', 'subject-a', 5, 3600)]
    for (let n = 0; n < 5; n += 1) await take(hour, at(n * 70))

    expect(await take(hour, at(3599))).toBe(false)
    expect(await take(hour, at(3601))).toBe(true)
  })

  it('F7-AC-06: a denied take does not advance the counter, so a flood cannot extend its own lockout', async () => {
    const minute = [ask('address_minute', 'subject-a', 1, 60)]
    await take(minute, at(0))

    // Twenty refusals across the window. If any of them counted, `window_start`
    // would keep moving forward and the address would never come back.
    for (let n = 1; n <= 20; n += 1) expect(await take(minute, at(n))).toBe(false)

    expect(await hitsFor('address_minute', 'subject-a')).toBe(1)
    expect(await take(minute, at(61))).toBe(true)
  })

  it('F7-AC-06, F7-AC-07: when one limit denies, none of the others is consumed', async () => {
    // Two limits over the same window, so nothing can roll mid-test and confuse
    // the reading. The address ceiling is spent; the source ceiling is nowhere
    // near its own. A request refused by the first must not burn the second —
    // otherwise one address being throttled would eat the allowance of every
    // other request from the same place.
    const asks = [ask('address_hour', 'subject-a', 5, 3600), ask('source_hour', 'source-1', 50, 3600)]
    for (let n = 0; n < 5; n += 1) expect(await take(asks, at(n))).toBe(true)

    expect(await take(asks, at(6))).toBe(false)

    expect(await hitsFor('address_hour', 'subject-a')).toBe(5)
    expect(await hitsFor('source_hour', 'source-1')).toBe(5)
  })

  it('F7-AC-06: an expired window is rolled rather than counted, even on a request that is denied', async () => {
    // The distinction the test above nearly got wrong. Rolling a window whose
    // time is up is not consuming it: a request denied by the hourly ceiling
    // leaves a long-expired minute bucket reset and unspent, so the address is
    // not held out a second longer than the ceiling itself holds it.
    const asks = [ask('address_minute', 'subject-a', 1, 60), ask('address_hour', 'subject-a', 5, 3600)]
    for (let n = 0; n < 5; n += 1) await take(asks, at(n * 70))

    expect(await take(asks, at(5 * 70))).toBe(false)

    expect(await hitsFor('address_hour', 'subject-a')).toBe(5)
    expect(await hitsFor('address_minute', 'subject-a')).toBe(0)
  })

  it('F7-AC-06: one source is capped across six different addresses', async () => {
    // The per-address ceiling cannot fire here — every address is new — so this
    // passes only if the source ceiling is real rather than shadowed by it.
    for (let n = 0; n < 5; n += 1) {
      const asks = [
        ask('address_hour', `subject-${n}`, 5, 3600),
        ask('source_hour', 'source-1', 5, 3600),
      ]
      expect(await take(asks, at(n * 70))).toBe(true)
    }

    const sixth = [ask('address_hour', 'subject-5', 5, 3600), ask('source_hour', 'source-1', 5, 3600)]
    expect(await take(sixth, at(5 * 70))).toBe(false)
  })
})

describe('F7-AC-09 · the attempt counter, in the database that holds it', () => {
  const hits = async (now: string) =>
    (
      await db.as<{ n: number }>(
        'service_role',
        null,
        `select public.auth_attempt_hits('subject-a', 3600, '${now}'::timestamptz) as n`,
      )
    )[0]!.n

  const bump = async (now: string) =>
    (
      await db.as<{ n: number }>(
        'service_role',
        null,
        `select public.auth_attempt_bump('subject-a', 3600, '${now}'::timestamptz) as n`,
      )
    )[0]!.n

  it('F7-AC-09: five real failures take the count to five', async () => {
    for (let n = 1; n <= 5; n += 1) expect(await bump(at(n))).toBe(n)
    expect(await hits(at(6))).toBe(5)
  })

  it('F7-AC-09: clearing forgets the count, which is what a freshly sent code does', async () => {
    for (let n = 1; n <= 5; n += 1) await bump(at(n))
    await db.as('service_role', null, `select public.auth_attempt_clear('subject-a')`)

    expect(await hits(at(6))).toBe(0)
  })

  it('F7-AC-09: the count expires with its window rather than standing for ever', async () => {
    for (let n = 1; n <= 5; n += 1) await bump(at(n))

    expect(await hits(at(3599))).toBe(5)
    expect(await hits(at(3601))).toBe(0)
  })
})

describe('F7-AC-06, F7-AC-09 · the functions are not a way in', () => {
  // Postgres grants EXECUTE to PUBLIC on every new function, and STE-29's
  // "Automatically expose new tables = OFF" covers tables rather than functions —
  // so without the revokes in the migration, PostgREST publishes all four of
  // these as anon-callable RPCs. `auth_attempt_clear` in particular would undo
  // the attempt limit entirely.
  const FUNCTIONS = [
    'public.auth_throttle_take(jsonb, timestamptz)',
    'public.auth_attempt_hits(text, integer, timestamptz)',
    'public.auth_attempt_bump(text, integer, timestamptz)',
    'public.auth_attempt_clear(text)',
  ]

  it('F7-AC-06, F7-AC-09: neither anon nor authenticated may execute any of them', async () => {
    for (const fn of FUNCTIONS) {
      const rows = await db.as<{ anon: boolean; authed: boolean }>(
        'service_role',
        null,
        `select has_function_privilege('anon', '${fn}', 'execute') as anon,
                has_function_privilege('authenticated', '${fn}', 'execute') as authed`,
      )
      expect(rows[0], `${fn} should be unreachable as anon`).toMatchObject({ anon: false, authed: false })
    }
  })

  it('F7-AC-06, F7-AC-09: the service role may, or the server cannot enforce anything', async () => {
    // The mirror of the test above. Without it, revoking from everybody would
    // pass the check while breaking the login entirely.
    for (const fn of FUNCTIONS) {
      const rows = await db.as<{ svc: boolean }>(
        'service_role',
        null,
        `select has_function_privilege('service_role', '${fn}', 'execute') as svc`,
      )
      expect(rows[0]?.svc, `${fn} should be reachable as service_role`).toBe(true)
    }
  })
})
