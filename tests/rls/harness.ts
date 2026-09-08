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
 * - The default-privileges grant reproduces Supabase's own, so that a table
 *   protected only by "we never granted it" is not mistaken for one protected by
 *   a policy.
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

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
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
}
