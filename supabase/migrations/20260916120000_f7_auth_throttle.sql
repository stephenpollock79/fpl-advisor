-- F7 hardening (STE-68): the rate limits and the attempt limit.
--
-- Specified in architecture.md §3 and §4 since slice 1 and not built until now:
-- "stored in `auth_throttle`, which is written before anyone is authenticated
-- and is therefore service-role only."
--
-- Because every row is written before anyone is signed in, there is no
-- auth.uid() to key a policy to. That is not a departure from ADR 0007 but an
-- application of it — the same posture as `app_session`, for the same reason:
-- RLS on with NO policy, grants withheld from anon and authenticated, so the
-- denial does not depend on one mechanism.
--
-- **Subjects are HMAC digests, never addresses.** An email is a guessable input,
-- so a bare SHA-256 of one is reversible against any address you can name.
-- Keyed with SESSION_COOKIE_SECRET it is not, and a copy of this table stops
-- being a list of who has tried to sign in. The keying happens in the server
-- (node:crypto); this table never sees an address and has no column that could
-- hold one.

-- ---------------------------------------------------------------------------
-- auth_throttle — code-request and verify-attempt counters. Service-role only.
-- ---------------------------------------------------------------------------
-- One row per (limit, subject). A row is a window: when `window_start` is older
-- than the limit's own window the row is rolled rather than deleted, so there is
-- no sweeper to forget to run and no growth beyond one row per subject per kind.

create table public.auth_throttle (
  -- The set is closed so a typo in the server is a failure rather than a silent
  -- fourth bucket that never fills and never denies anything.
  kind          text not null check (kind in ('address_minute', 'address_hour', 'source_hour', 'verify_attempt')),
  subject_hash  text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (kind, subject_hash)
);

comment on table public.auth_throttle is
  'posture:service — code-request and verify-attempt counters, keyed by HMAC digest. Written before anyone is authenticated, so there is no auth.uid() to key a policy to.';

alter table public.auth_throttle enable row level security;
alter table public.auth_throttle force row level security;

grant select, insert, update, delete on public.auth_throttle to service_role;
revoke all on public.auth_throttle from anon, authenticated;

-- No policy, deliberately. A policy here would be a way in.

-- ---------------------------------------------------------------------------
-- auth_throttle_take — decide and record, in one statement.
-- ---------------------------------------------------------------------------
-- **Every limit is asked in one call, and that is a security property rather
-- than a performance one.** F7-AC-07 requires a throttled request to return
-- exactly what an accepted one returns — and the leak this slice closes was a
-- clock, not a body. If an accepted request did more database work than a
-- throttled one, the 77x timing oracle measured on 2026-09-08 would come back at
-- 2x and the criterion would be just as false.
--
-- Two passes, and the order matters:
--
--   1. Roll every expired window and read the counts, taking each row lock on
--      the way past. Nothing is incremented.
--   2. Only if every limit passed, increment them all.
--
-- **A denied take advances nothing.** Incrementing on denial would push the
-- window's end forward on every rejected attempt, so a flood would extend its
-- own lockout indefinitely and one authorised address could be held out for as
-- long as someone cared to keep asking.
--
-- Asks are sorted before locking so two concurrent callers over the same subject
-- set always take the locks in the same order and cannot deadlock.
--
-- `p_now` is a parameter rather than now() so a test can drive the window
-- forward without sleeping. Production omits it and takes the default.

create function public.auth_throttle_take(
  p_asks jsonb,
  p_now  timestamptz default now()
) returns boolean
language plpgsql
as $$
declare
  ask      jsonb;
  v_hits   integer;
  allowed  boolean := true;
begin
  for ask in
    select value
      from jsonb_array_elements(p_asks) as value
     order by value ->> 'kind', value ->> 'subject'
  loop
    insert into public.auth_throttle as t (kind, subject_hash, window_start, hits, updated_at)
    values (ask ->> 'kind', ask ->> 'subject', p_now, 0, p_now)
    on conflict (kind, subject_hash) do update
      set window_start = case
            when t.window_start + make_interval(secs => (ask ->> 'windowSeconds')::integer) <= p_now
              then p_now else t.window_start end,
          hits = case
            when t.window_start + make_interval(secs => (ask ->> 'windowSeconds')::integer) <= p_now
              then 0 else t.hits end,
          updated_at = p_now
    returning t.hits into v_hits;

    if v_hits >= (ask ->> 'limit')::integer then
      allowed := false;
    end if;
  end loop;

  if not allowed then
    return false;
  end if;

  for ask in select value from jsonb_array_elements(p_asks) as value loop
    update public.auth_throttle
       set hits = hits + 1, updated_at = p_now
     where kind = ask ->> 'kind' and subject_hash = ask ->> 'subject';
  end loop;

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- The attempt limit (F7-AC-09), as three operations rather than one.
-- ---------------------------------------------------------------------------
-- Read, increment and clear happen at three different moments in the verify
-- flow and never together: the read is before the provider is called, the
-- increment only after a failure, and the clear on success or when a fresh code
-- is actually sent.
--
-- **Counted per address, not per code.** Supabase owns the code and never shows
-- it to us, so an address is the only subject available. That is stricter than
-- the criterion rather than looser — five failures spread across two codes still
-- spends the live one.

create function public.auth_attempt_hits(
  p_subject        text,
  p_window_seconds integer,
  p_now            timestamptz default now()
) returns integer
language sql
stable
as $$
  select coalesce(
    (select t.hits
       from public.auth_throttle t
      where t.kind = 'verify_attempt'
        and t.subject_hash = p_subject
        and t.window_start + make_interval(secs => p_window_seconds) > p_now),
    0);
$$;

create function public.auth_attempt_bump(
  p_subject        text,
  p_window_seconds integer,
  p_now            timestamptz default now()
) returns integer
language plpgsql
as $$
declare
  v_hits integer;
begin
  insert into public.auth_throttle as t (kind, subject_hash, window_start, hits, updated_at)
  values ('verify_attempt', p_subject, p_now, 1, p_now)
  on conflict (kind, subject_hash) do update
    set window_start = case
          when t.window_start + make_interval(secs => p_window_seconds) <= p_now
            then p_now else t.window_start end,
        hits = case
          when t.window_start + make_interval(secs => p_window_seconds) <= p_now
            then 1 else t.hits + 1 end,
        updated_at = p_now
  returning t.hits into v_hits;

  return v_hits;
end $$;

create function public.auth_attempt_clear(p_subject text)
returns void
language sql
as $$
  delete from public.auth_throttle
   where kind = 'verify_attempt' and subject_hash = p_subject;
$$;

-- ---------------------------------------------------------------------------
-- Function grants. Not optional, and not covered by the project setting.
-- ---------------------------------------------------------------------------
-- **Postgres grants EXECUTE to PUBLIC on every new function.** STE-29 switched
-- "Automatically expose new tables" OFF, which is why every table above states
-- its grants — but that setting covers tables, and a function in `public` with
-- no explicit revoke is published by PostgREST as an anon-callable RPC.
--
-- So an unprotected `auth_throttle_take` would let a stranger burn an
-- authorised address's hourly ceiling from the outside, and an unprotected
-- `auth_attempt_clear` would undo the attempt limit entirely — the one control
-- standing between a six-digit code and an unbounded guessing loop.
--
-- Same failure class as grants-before-policies, one layer along: the policies
-- are correct, the table is unreachable, and the door is the function beside it.
-- Asserted in tests/auth/throttle.pg.test.ts with has_function_privilege rather
-- than trusted.

revoke execute on function public.auth_throttle_take(jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.auth_attempt_hits(text, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.auth_attempt_bump(text, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.auth_attempt_clear(text) from public, anon, authenticated;

grant execute on function public.auth_throttle_take(jsonb, timestamptz) to service_role;
grant execute on function public.auth_attempt_hits(text, integer, timestamptz) to service_role;
grant execute on function public.auth_attempt_bump(text, integer, timestamptz) to service_role;
grant execute on function public.auth_attempt_clear(text) to service_role;
