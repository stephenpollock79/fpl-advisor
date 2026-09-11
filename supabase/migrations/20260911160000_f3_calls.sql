-- Slice 5 — F3 transfer and substitution calls (STE-62).
--
-- Three user tables and one reference column. Additive only.
--
-- **Every user table ships its policy here, in the migration that creates it**,
-- and grants nothing to service_role (ADR 0007). The service key carries
-- BYPASSRLS, so withholding the grant is what makes "user data is read as the
-- user" a property of the database rather than of whoever writes the next query.

-- ---------------------------------------------------------------------------
-- player_state.cost_change_start_tenths — reference.
-- ---------------------------------------------------------------------------
-- FPL's `cost_change_start`, in tenths like every other price. A player held
-- since gameweek 1 has no transfer to read a purchase price from, and paid
-- `now_cost − cost_change_start` (STE-87). Nullable, because rows written before
-- this slice do not carry it.

alter table public.player_state add column cost_change_start_tenths integer;

-- ---------------------------------------------------------------------------
-- run — one advice generation.
-- ---------------------------------------------------------------------------
-- **The last-run time is max(finished_at) where status = 'succeeded'** — never
-- the last row, so a failed run cannot age the advice (F6-AC-14).
--
-- `model_calls` records every model call against the run from the first commit:
-- model id, step, tokens and cost (ADR 0008, ADR 0009). The pinned identifier
-- read back off this column is the evidence that a run used what was configured;
-- the config is only a claim.

create table public.run (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  gameweek          integer not null references public.gameweek (id),
  scope             text not null default 'all'
                      check (scope in ('all', 'transfer', 'substitution', 'captaincy', 'chips')),
  trigger           text not null default 'first_open'
                      check (trigger in ('first_open', 'refresh', 'screenshot_correction', 'gameweek_rollover')),
  status            text not null default 'running'
                      check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  squad_snapshot_id uuid,
  model_calls       jsonb not null default '[]'::jsonb,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cost_usd          numeric(10, 6) not null default 0
);

comment on table public.run is
  'posture:user — one advice generation, what it saw and what it cost. Isolated by RLS on user_id.';

create index run_user_gameweek_idx on public.run (user_id, gameweek, status, finished_at);

-- Referenced as a pair by call, for the same reason squad_player references
-- squad_snapshot's pair: a call cannot name an owner its run does not have.
alter table public.run add constraint run_id_user_key unique (id, user_id);

alter table public.run enable row level security;
alter table public.run force row level security;

create policy run_select_own on public.run
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy run_insert_own on public.run
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy run_update_own on public.run
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.run to authenticated;
revoke all on public.run from anon;
revoke all on public.run from service_role;

-- ---------------------------------------------------------------------------
-- call — one call, as produced by one run.
-- ---------------------------------------------------------------------------
-- Thrown away and rewritten by the next run, so no decision belongs to it; a
-- decision belongs to `call_key` (architecture.md §5).
--
-- **Every figure here was computed by the engine and is stored as computed.**
-- Nothing re-derives net, conviction or band on read (ENGINE-AC-04), so no two
-- surfaces can disagree about a call.

create table public.call (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  run_id           uuid not null,
  gameweek         integer not null references public.gameweek (id),
  call_key         text not null,
  category         text not null check (category in ('transfer', 'substitution', 'captaincy')),
  shape            text not null check (shape in (
                     'transfer', 'forced_swap', 'doubt_swap', 'upgrade_swap', 'bench_order', 'captain', 'vice')),
  out_player_id    integer not null references public.player (id),
  in_player_id     integer not null references public.player (id),
  net              numeric(6, 2) not null check (net >= 0),
  conviction       integer not null check (conviction between 5 and 95),
  band             text not null check (band in ('certain', 'strong', 'lean', 'thin')),
  k_used           numeric(4, 2) not null,
  points_hit       integer not null default 0,
  cost_tenths      integer not null default 0,
  is_forced        boolean not null default false,
  -- Set by code, never by the model, never from conviction (F3-AC-17). Nothing
  -- sets it yet: neither trigger has a data source (STE-117).
  watch_flag       boolean not null default false,
  reasoning        text not null,
  reasoning_source text not null check (reasoning_source in ('model', 'template')),
  -- Every value already computed in the pipeline. Nothing is calculated when
  -- this is displayed (F3-AC-31).
  breakdown        jsonb not null,
  -- The curated picker lists for a transfer: three out, five in (F3-AC-23).
  alternatives     jsonb,
  position         integer not null,
  constraint call_run_fk foreign key (run_id, user_id)
    references public.run (id, user_id) on delete cascade,
  constraint call_run_key unique (run_id, call_key)
);

comment on table public.call is
  'posture:user — the calls one run produced, with the engine''s figures as computed. Isolated by RLS on user_id, pinned to the run''s own by the pair foreign key.';

create index call_run_idx on public.call (run_id, position);

alter table public.call enable row level security;
alter table public.call force row level security;

create policy call_select_own on public.call
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy call_insert_own on public.call
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.call to authenticated;
revoke all on public.call from anon;
revoke all on public.call from service_role;

-- ---------------------------------------------------------------------------
-- decision — the manager's answer, which outlives the run that prompted it.
-- ---------------------------------------------------------------------------
-- Keyed to the call's identity, not to a call row. **Pending is the absence of
-- a row** (F3-AC-01), so returning a call to pending review deletes it
-- (F3-AC-14) — which is why this is the one user table granted delete.
--
-- Keyed by gameweek too, so a rollover is a clean slate by construction rather
-- than by a delete anybody has to remember (F6-UP-03).

create table public.decision (
  user_id               uuid not null references auth.users (id) on delete cascade,
  gameweek              integer not null references public.gameweek (id),
  call_key              text not null,
  state                 text not null check (state in ('selected', 'rejected')),
  decided_at            timestamptz not null default now(),
  -- Set when a squad correction contradicts a selected call (F2-AC-07).
  broken_by_snapshot_id uuid,
  primary key (user_id, gameweek, call_key)
);

comment on table public.decision is
  'posture:user — the manager''s decision per call identity per gameweek. Isolated by RLS on user_id.';

alter table public.decision enable row level security;
alter table public.decision force row level security;

create policy decision_select_own on public.decision
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy decision_insert_own on public.decision
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy decision_update_own on public.decision
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy decision_delete_own on public.decision
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.decision to authenticated;
revoke all on public.decision from anon;
revoke all on public.decision from service_role;
