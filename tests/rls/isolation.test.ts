/**
 * STE-58 — the RLS isolation test.
 *
 * The point of F7-AC-11 is not that policies exist. It is that isolation holds.
 * Those are different claims, and asserting the first while believing the second
 * is the specific way this slice would ship broken: a `pg_policies` row count is
 * satisfied by a policy of `using (true)`.
 *
 * So the load-bearing tests below sign in as user A and try to read user B's
 * rows. Everything else is scaffolding around that.
 *
 * The table list is discovered, never hard-coded. A later slice that adds a table
 * without declaring its posture fails the first test here, and one that adds a
 * user-data table without a working policy fails the fourth — which is what makes
 * "from the first migration onward" hold for migrations nobody has written yet.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestDb, USER_A, USER_B, freshDb, seedTwoAccounts } from './harness.js'

type Posture = 'user' | 'reference' | 'service'
type TableInfo = { table: string; posture: Posture | null; rlsEnabled: boolean; policies: number }

let db: TestDb
let tables: TableInfo[]

const POSTURES: Posture[] = ['user', 'reference', 'service']

beforeAll(async () => {
  db = await freshDb()
  await seedTwoAccounts(db)

  tables = await db.as<TableInfo>(
    'service_role',
    null,
    `select c.relname                                        as table,
            substring(obj_description(c.oid, 'pg_class') from 'posture:(\\w+)') as posture,
            c.relrowsecurity                                 as "rlsEnabled",
            (select count(*)::int from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname) as policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  )
})

afterAll(async () => {
  await db?.close()
})

const userTables = () => tables.filter((t) => t.posture === 'user')

describe('F7-AC-11 · per-user data isolation is enforced by the database', () => {
  it('F7-AC-11: the migrations create at least one table, so an empty pass is impossible', () => {
    // Without this, every test below passes vacuously the day someone breaks the
    // harness — a green suite proving nothing is worse than a red one.
    expect(tables.length).toBeGreaterThan(0)
    expect(userTables().length).toBeGreaterThan(0)
  })

  it('F7-AC-11: every table in public declares its security posture', () => {
    const undeclared = tables.filter((t) => t.posture === null || !POSTURES.includes(t.posture))
    expect(
      undeclared.map((t) => t.table),
      'every table needs `comment on table … is \'posture:user|reference|service — …\'` in the ' +
        'migration that creates it. A migration that does not state a table\'s posture is not ' +
        'self-describing, and this test cannot classify what it was not told.',
    ).toEqual([])
  })

  it('F7-AC-11: every table has row-level security enabled, reference tables included', () => {
    // Supabase's automatic-RLS trigger would do this in production. The migration
    // states it anyway, and this asserts the migration rather than the trigger —
    // the trigger is a backstop, and a backstop that is also the mechanism is not
    // a backstop.
    const unprotected = tables.filter((t) => !t.rlsEnabled)
    expect(unprotected.map((t) => t.table)).toEqual([])
  })

  it('F7-AC-11: every user-data table carries at least one policy', () => {
    // Necessary and nowhere near sufficient — `using (true)` satisfies this and
    // isolates nothing. The test that matters is the next one.
    const policyless = userTables().filter((t) => t.policies === 0)
    expect(policyless.map((t) => t.table)).toEqual([])
  })

  it('F7-AC-11: a signed-in user cannot read another user\'s rows', async () => {
    // If this throws "permission denied", the table has policies and no grant —
    // security that never runs, because Postgres checks grants first. That is
    // exactly what dev reported before the grants migration existed.
    for (const { table } of userTables()) {
      const asA = await db.as('authenticated', USER_A, `select user_id from public.${table}`)
      const asB = await db.as('authenticated', USER_B, `select user_id from public.${table}`)

      expect(asA.map((r) => r['user_id']), `${table}: user A saw rows that are not A's`).toEqual([USER_A])
      expect(asB.map((r) => r['user_id']), `${table}: user B saw rows that are not B's`).toEqual([USER_B])
    }
  })

  it('F7-AC-11: a signed-in user cannot write a row belonging to another user', async () => {
    for (const { table } of userTables()) {
      // Claiming B's identity on insert.
      await expect(
        db.as('authenticated', USER_A, `insert into public.${table} (user_id) values ('${USER_B}')`),
        `${table}: user A inserted a row owned by B`,
      ).rejects.toThrow()

      // Reassigning one of A's own rows to B.
      const reassigned = await db.as(
        'authenticated',
        USER_A,
        `update public.${table} set user_id = '${USER_B}' where user_id = '${USER_A}' returning user_id`,
      ).catch(() => [])
      expect(reassigned, `${table}: user A moved a row to B`).toEqual([])
    }
  })

  it('F7-AC-11: a signed-out visitor reads nothing at all', async () => {
    for (const { table } of userTables()) {
      const rows = await db.as('anon', null, `select 1 from public.${table}`).catch(() => [])
      expect(rows, `${table}: anon read rows`).toEqual([])
    }
  })

  it('F7-AC-11: service-posture tables are unreachable as authenticated', async () => {
    for (const { table } of tables.filter((t) => t.posture === 'service')) {
      const rows = await db
        .as('authenticated', USER_A, `select 1 from public.${table}`)
        .catch(() => [])
      expect(rows, `${table}: an authenticated user reached a service-only table`).toEqual([])
    }
  })
})

describe('ADR 0007 · the service key cannot reach user data, by grant', () => {
  it('F7-AC-11: service_role has no privilege on any user-data table', async () => {
    // This was a naming convention in supabase.ts until dev proved grants are
    // ours to state ("Automatically expose new tables" is off, STE-29). Now it is
    // a property of the database: the service key cannot read `manager` at all,
    // so ADR 0007's rule cannot be broken by a careless import.
    for (const { table } of userTables()) {
      const [row] = await db.as<{ readable: boolean; writable: boolean }>(
        'service_role',
        null,
        `select has_table_privilege('service_role', 'public.${table}', 'SELECT') as readable,
                has_table_privilege('service_role', 'public.${table}', 'INSERT') as writable`,
      )
      expect(row?.readable, `${table}: service_role can read user data`).toBe(false)
      expect(row?.writable, `${table}: service_role can write user data`).toBe(false)
    }
  })

  it('F7-AC-11: service_role bypasses RLS, which is why the grant is withheld rather than the policy trusted', async () => {
    // The reasoning behind the test above, asserted so it does not decay into
    // folklore. If service_role were ever granted a user table, no policy on that
    // table would apply to it.
    const [row] = await db.as<{ bypasses: boolean }>(
      'service_role',
      null,
      `select rolbypassrls as bypasses from pg_roles where rolname = 'service_role'`,
    )
    expect(row?.bypasses).toBe(true)
  })

  it('F7-AC-11: the signed-in user has exactly the privileges the app needs, and no more', async () => {
    for (const { table } of userTables()) {
      const [row] = await db.as<Record<string, boolean>>(
        'service_role',
        null,
        `select has_table_privilege('authenticated', 'public.${table}', 'SELECT') as "select",
                has_table_privilege('authenticated', 'public.${table}', 'DELETE') as "delete",
                has_table_privilege('anon',          'public.${table}', 'SELECT') as "anonSelect"`,
      )
      expect(row?.['select'], `${table}: authenticated cannot read its own rows`).toBe(true)
      // Delete is granted only where a delete policy governs it. A grant with no
      // policy is a privilege nothing constrains; a policy with no grant is
      // security that never runs. `decision` is the one table that needs both —
      // returning a call to pending review removes its row (F3-AC-14).
      const [policy] = await db.as<{ n: number }>(
        'service_role',
        null,
        `select count(*)::int as n from pg_policies
          where schemaname = 'public' and tablename = '${table}' and cmd = 'DELETE'`,
      )
      expect(
        row?.['delete'],
        `${table}: a delete grant and a delete policy must come together or not at all`,
      ).toBe((policy?.n ?? 0) > 0)
      expect(row?.['anonSelect'], `${table}: anon was granted a user table`).toBe(false)
    }
  })

  it('F7-AC-11, F3-AC-14: where a user may delete, he can delete only his own rows', async () => {
    for (const { table } of userTables()) {
      const removed = await db
        .as('authenticated', USER_A, `delete from public.${table} where user_id = '${USER_B}' returning user_id`)
        .catch(() => [])
      expect(removed, `${table}: user A deleted a row belonging to B`).toEqual([])
    }
  })

  it('F7-AC-11: service-posture tables are granted to service_role and to nobody else', async () => {
    for (const { table } of tables.filter((t) => t.posture === 'service')) {
      const [row] = await db.as<Record<string, boolean>>(
        'service_role',
        null,
        `select has_table_privilege('service_role',  'public.${table}', 'SELECT') as "service",
                has_table_privilege('authenticated', 'public.${table}', 'SELECT') as "authed",
                has_table_privilege('anon',          'public.${table}', 'SELECT') as "anon"`,
      )
      expect(row?.['service'], `${table}: the server cannot read its own table`).toBe(true)
      expect(row?.['authed'], `${table}: an authenticated user reached a service table`).toBe(false)
      expect(row?.['anon'], `${table}: anon reached a service table`).toBe(false)
    }
  })
})

describe('F1 · the reference tables the world lives in', () => {
  it('F7-AC-11: reference tables are unreachable as anon and as authenticated', async () => {
    const reference = tables.filter((t) => t.posture === 'reference')
    expect(reference.length, 'no reference tables found — the filter is wrong').toBeGreaterThan(0)

    for (const { table } of reference) {
      // RLS on with no policy denies both roles, and the grants are withheld as
      // well, so neither mechanism is the single point of failure. Nothing reads
      // these from a browser (ADR 0007) — if that ever changes, the select policy
      // is decided per table in a migration, not discovered here.
      for (const role of ['anon', 'authenticated'] as const) {
        await expect(
          db.as(role, USER_A, `select * from public.${table} limit 1`),
          `${table}: reachable as ${role}`,
        ).rejects.toThrow()
      }
    }
  })

  it('F7-AC-11: the service key can read reference data, which is the half that must work', async () => {
    // The mirror of the test above. Withholding every grant would also pass
    // "unreachable as anon", and would break the app instead of protecting it —
    // which is precisely what dev did before the grants migration existed.
    for (const { table } of tables.filter((t) => t.posture === 'reference')) {
      await expect(
        db.as('service_role', USER_A, `select * from public.${table} limit 1`),
        `${table}: the server cannot read its own reference data`,
      ).resolves.toBeDefined()
    }
  })
})

describe('F1 · a squad row cannot claim an owner its snapshot disagrees with', () => {
  it('F7-AC-11: squad_player.user_id is pinned to the snapshot by foreign key', async () => {
    // squad_player carries user_id so the generic isolation tests above can read
    // it the same way they read every other user table. That duplication is only
    // safe because it cannot diverge: the foreign key points at the snapshot's
    // (id, user_id) pair, so a row naming the wrong owner is rejected by the
    // database rather than by a policy anyone has to write correctly.
    await expect(
      db.sql(`
        insert into public.squad_player (snapshot_id, user_id, player_id, is_starter, bench_order)
        values ('aaaaaaaa-0000-0000-0000-00000000000a', '${USER_B}', 101, false, 0)
      `),
      'a squad_player row claimed an owner its snapshot does not have',
    ).rejects.toThrow()
  })
})

