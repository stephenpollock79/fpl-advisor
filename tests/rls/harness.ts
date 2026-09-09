/**
 * A real Postgres, in-process, with just enough Supabase around it for the
 * migrations to mean what they mean in production.
 *
 * Why not run the isolation test against the dev Supabase project? Because a
 * test that needs credentials is a test that does not run in CI, and an
 * isolation test that does not run on every pull request is an isolation test
 * that will be broken by a later slice and noticed by nobody. This runs
 * everywhere, on the real migration files, against real Postgres row-level
 * security.
 *
 * What it therefore proves, exactly: **that the migrations in supabase/migrations
 * isolate one user's rows from another's.** What it does not prove: that the dev
 * or prod project actually has those migrations applied. That is a deployment
 * fact, not a code fact, and it needs a live check — see docs/manual-coverage.md.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))

/**
 * The parts of a Supabase project the migrations assume exist. Kept deliberately
 * small and in one place: everything here is emulation, and anything that drifts
 * from the real platform makes the test lie rather than fail.
 *
 * - `auth.users` and `auth.uid()` are the real shapes. `auth.uid()` reads the
 *   same `request.jwt.claims` setting PostgREST sets per request.
 * - `anon`, `authenticated` and `service_role` are the real roles. `service_role`
 *   carries BYPASSRLS, which is precisely why ADR 0007 says user data must never
 *   be read with it.
 * - **No default privileges are granted, because this project's Supabase projects
 *   have "Automatically expose new tables" switched OFF** (STE-29). A new table
 *   therefore reaches no role until the migration grants it explicitly.
 *
 *   An earlier version of this file granted `all on tables` to all three roles by
 *   default, which is what Supabase does when that setting is ON. It made the
 *   suite optimistic: the migration passed every isolation test here while, on
 *   dev, `service_role` itself got `permission denied for table manager`. Postgres
 *   checks grants before policies, so RLS that nothing can reach proves nothing.
 *   Modelling the project we actually have is the whole value of this harness.
 */
const SUPABASE_PREAMBLE = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text unique
  );

  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls; end if;
  end $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth   to anon, authenticated, service_role;
`

export type TestDb = {
  sql: (query: string) => Promise<void>
  /** Run a query as the given role, optionally as a signed-in user. */
  as: <T = Record<string, unknown>>(
    role: 'anon' | 'authenticated' | 'service_role',
    userId: string | null,
    query: string,
  ) => Promise<T[]>
  close: () => Promise<void>
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** A fresh database with the Supabase preamble and every migration applied, in order. */
export async function freshDb(): Promise<TestDb> {
  const db = new PGlite()
  await db.exec(SUPABASE_PREAMBLE)
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  const as = async <T>(
    role: 'anon' | 'authenticated' | 'service_role',
    userId: string | null,
    query: string,
  ): Promise<T[]> => {
    // Mirrors what PostgREST does per request: assume the role, then publish the
    // JWT claims that auth.uid() reads. Both are reset afterwards so one test's
    // identity cannot leak into the next.
    const claims = userId === null ? '' : JSON.stringify({ sub: userId, role })
    await db.exec(`set role ${role};`)
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
    try {
      const result = await db.query<T>(query)
      return result.rows
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
    }
  }

  return {
    sql: (query: string) => db.exec(query).then(() => undefined),
    as,
    close: () => db.close(),
  }
}

export const USER_A = '11111111-1111-1111-1111-111111111111'
export const USER_B = '22222222-2222-2222-2222-222222222222'

/** Two accounts, so that "cannot read the other's rows" has an other. */
export async function seedTwoAccounts(db: TestDb): Promise<void> {
  await db.sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@example.test'),
      ('${USER_B}', 'b@example.test');

    insert into public.manager (user_id, fpl_team_id, team_name, manager_name)
    values
      ('${USER_A}', 1111111, 'A United',  'Manager A'),
      ('${USER_B}', 2222222, 'B Rovers',  'Manager B');

    insert into public.app_session (token_hash, user_id, supabase_refresh_token, expires_at)
    values
      ('hash-of-a-cookie-for-A', '${USER_A}', 'refresh-token-for-A', now() + interval '30 days'),
      ('hash-of-a-cookie-for-B', '${USER_B}', 'refresh-token-for-B', now() + interval '30 days');
  `)

  await seedSquads(db)
}

/**
 * A squad each, so the generic isolation tests have something to fail on.
 *
 * Every user-posture table needs a row per account, or "user A cannot read B's
 * rows" passes against two empty tables and proves nothing. That is the same
 * shape of false pass as asserting a policy exists rather than that isolation
 * holds, which is what this suite was written to avoid — so the seed grows
 * whenever a user table does.
 *
 * The reference rows exist only to satisfy foreign keys. They are the world, not
 * anyone's data, and they are deliberately identical for both accounts: two
 * managers owning the same player is the ordinary case, and a seed that gave them
 * different players would let a test pass because the rows happened not to
 * collide rather than because a policy stopped them.
 */
async function seedSquads(db: TestDb): Promise<void> {
  await db.sql(`
    insert into public.gameweek (id, name, deadline_time, is_next)
    values (5, 'Gameweek 5', now() + interval '2 days', true);

    insert into public.club (id, name, short_name) values (1, 'Arsenal', 'ARS');

    insert into public.player (id, club_id, position, first_name, surname, shirt_number)
    values (101, 1, 'MID', 'Bukayo', 'Saka', 7);

    insert into public.squad_snapshot
      (id, user_id, gameweek, source, bank_tenths, free_transfers, chips_remaining)
    values
      ('aaaaaaaa-0000-0000-0000-00000000000a', '${USER_A}', 5, 'fpl_deadline', 12, 1, '{}'::jsonb),
      ('bbbbbbbb-0000-0000-0000-00000000000b', '${USER_B}', 5, 'fpl_deadline', 30, 2, '{}'::jsonb);

    insert into public.squad_player
      (snapshot_id, user_id, player_id, is_starter, bench_order, is_captain)
    values
      ('aaaaaaaa-0000-0000-0000-00000000000a', '${USER_A}', 101, true, null, true),
      ('bbbbbbbb-0000-0000-0000-00000000000b', '${USER_B}', 101, true, null, false);
  `)
}
