-- 0001 — F7-core: the account row and the session.
--
-- Slice 1 of the build order (STE-51). Row-level security ships in the migration
-- that creates the table it protects, not afterwards (F7-AC-11): a table created
-- before its policy is a table to retrofit, and retrofitted RLS is where a silent
-- hole ends up.
--
-- Supabase's automatic-RLS event trigger is enabled on both projects, so RLS is
-- already on for every new table in `public`. Every ENABLE ROW LEVEL SECURITY
-- below is therefore redundant, and written anyway: the trigger is a fail-closed
-- backstop, never the mechanism. A migration that does not state a table's
-- security posture is not self-describing, and the next person reading this file
-- should not have to know about a project setting to know what protects a table.
--
-- Every table declares its posture as a COMMENT. That is not decoration —
-- tests/rls/isolation.test.ts fails on any table in `public` whose posture is not
-- declared, which is what stops a later slice adding a table and forgetting.

-- ---------------------------------------------------------------------------
-- manager — one row per account. User data.
-- ---------------------------------------------------------------------------
-- Created at first sign-in. The FPL columns are nullable because linking the
-- team is slice 2 (F7-AC-13); an account exists before it has a team.
--
-- No FPL credentials, ever — not requested, not transmitted, not stored. There
-- is no column for one here and there never will be.

create table public.manager (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  fpl_team_id   integer,
  team_name     text,
  manager_name  text,
  overall_rank  integer,
  linked_at     timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.manager is
  'posture:user — one row per account, keyed to auth.users. Isolated by RLS on user_id.';

alter table public.manager enable row level security;

-- Force applies the policies to the table owner too. Without it a future
-- SECURITY DEFINER function owned by the table owner would read every row.
alter table public.manager force row level security;

create policy manager_select_own on public.manager
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy manager_insert_own on public.manager
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy manager_update_own on public.manager
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deliberately no delete policy. Removing someone is deleting their account at
-- the provider (F7-UP-05), which cascades to this row; the app never offers it.

-- ---------------------------------------------------------------------------
-- app_session — the sliding session. Service-role only.
-- ---------------------------------------------------------------------------
-- ADR 0007: the browser holds one opaque httpOnly cookie our server issued and
-- never a Supabase token. This is the row behind that cookie. It holds a
-- provider refresh token, so it is never reachable as anon or authenticated —
-- RLS is enabled with NO policy, which denies both roles outright, and the
-- grants are revoked as well so the denial does not depend on one mechanism.
--
-- F7-AC-10's thirty-day window is `expires_at`, pushed forward on each
-- authenticated request. Ours, not the provider's, so it survives a downgrade
-- to the Free plan.

create table public.app_session (
  id                     uuid primary key default gen_random_uuid(),
  -- The cookie carries a random token; this is its SHA-256. Storing the hash
  -- rather than the token means a leaked copy of this table cannot be replayed
  -- as a session, which matters more than usual because the row beside it holds
  -- a provider refresh token.
  token_hash             text not null unique,
  user_id                uuid not null references auth.users (id) on delete cascade,
  supabase_refresh_token text not null,
  -- Cached so a user-token read is not a network hop per request. Refreshed
  -- only once it expires, which keeps the 200 ms budget in NFR Performance
  -- reachable without weakening ADR 0007's rule about which key reads what.
  supabase_access_token  text,
  access_token_expires_at timestamptz,
  created_at             timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  expires_at             timestamptz not null,
  revoked_at             timestamptz
);

comment on table public.app_session is
  'posture:service — holds a provider refresh token. Unreachable as anon or authenticated.';

create index app_session_user_id_idx on public.app_session (user_id);

alter table public.app_session enable row level security;
alter table public.app_session force row level security;

revoke all on public.app_session from anon, authenticated;

-- No policy, deliberately. A policy here would be a way in.
