-- 0003 — F1: squad state, the two feeds, and the join between them.
--
-- Slice 3 of the build order (STE-99). Nine tables: seven reference and two user.
--
-- Every table states its posture as a COMMENT and its grants explicitly, for the
-- reason the previous pair of migrations found the hard way — Postgres checks
-- grants before policies, so row-level security on a table nothing has been
-- granted is security that never runs, and a suite exercising only policies
-- reports it as working. "Automatically expose new tables" is OFF (STE-29), so no
-- default privilege reaches anything here.
--
-- Two families, and the split is ADR 0007's. **User data** is owned by a person
-- and carries a policy keyed to auth.uid(); it is granted to `authenticated` and
-- **withheld from service_role**, which is what makes "read user data as the user"
-- a property of the database rather than a naming convention in supabase.ts.
-- **Reference data** is the world — it belongs to nobody, is read and written by
-- the server with the service key, and has RLS enabled with NO policy, which
-- denies anon and authenticated outright.

-- ===========================================================================
-- REFERENCE DATA — the world. Service-role only, no policy, none by design.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- gameweek — and the two flags that are pure foot-guns.
-- ---------------------------------------------------------------------------
-- All four flags are stored because all four are read for different things.
--
--   is_next       ADVISE ON THIS. The feed marks a gameweek *current* until the
--                 following one locks, so while a deadline is unpassed
--                 is_current is a week already played. Keying off it produces
--                 confident advice about the wrong week, every week, with
--                 nothing visibly broken.
--   data_checked  READ LAST WEEK'S POINTS FROM THIS, not from `finished`.
--                 `finished` flips when the last match ends; bonus points and
--                 corrections land afterwards.
--
-- Both are in the G7 silent-failure class and both are asserted by unit test.

create table public.gameweek (
  id            integer primary key,
  name          text not null,
  deadline_time timestamptz not null,
  is_next       boolean not null default false,
  is_current    boolean not null default false,
  finished      boolean not null default false,
  data_checked  boolean not null default false
);

comment on table public.gameweek is
  'posture:reference — gameweeks and their deadlines. Advise on is_next; read last week''s points from data_checked.';

alter table public.gameweek enable row level security;
grant select, insert, update on public.gameweek to service_role;
revoke all on public.gameweek from anon, authenticated;

-- ---------------------------------------------------------------------------
-- club — the twenty, for names, kits and the three-per-club rule.
-- ---------------------------------------------------------------------------
create table public.club (
  id         integer primary key,
  name       text not null,
  short_name text not null
);

comment on table public.club is
  'posture:reference — the twenty clubs. Read by the server with the service key.';

alter table public.club enable row level security;
grant select, insert, update on public.club to service_role;
revoke all on public.club from anon, authenticated;

-- ---------------------------------------------------------------------------
-- player — identity only.
-- ---------------------------------------------------------------------------
-- Deliberately not the changing facts. Price, news and availability move every
-- read and live in player_state, one set per feed_read, so a diff has something
-- to compare against.
--
-- `surname` is stored untruncated. F1-UP-03's eleven-character cut is a display
-- rule applied at render; every lookup keys off the full name, so a shortened
-- form must never reach the database.

create table public.player (
  id           integer primary key,
  club_id      integer not null references public.club (id),
  position     text not null check (position in ('GKP', 'DEF', 'MID', 'FWD')),
  first_name   text not null,
  surname      text not null,
  shirt_number integer
);

comment on table public.player is
  'posture:reference — player identity only. Changing facts live in player_state.';

create index player_club_id_idx on public.player (club_id);

alter table public.player enable row level security;
grant select, insert, update on public.player to service_role;
revoke all on public.player from anon, authenticated;

-- ---------------------------------------------------------------------------
-- fixture — THE ONLY SOURCE OF A FIXTURE COUNT.
-- ---------------------------------------------------------------------------
-- No row for a club in a gameweek means it blanks; two rows is a double. The
-- projection is never consulted for the count — not from its size, not from its
-- presence — and on conflict the count wins.
--
-- Any gameweek where a club has other than one fixture is LOGGED at ingestion.
-- Blanks and doubles cannot be observed live this early in a season, so the first
-- real one has to announce itself rather than pass silently.

create table public.fixture (
  id              integer primary key,
  gameweek        integer not null references public.gameweek (id),
  home_club       integer not null references public.club (id),
  away_club       integer not null references public.club (id),
  kickoff         timestamptz,
  home_difficulty integer not null check (home_difficulty between 1 and 5),
  away_difficulty integer not null check (away_difficulty between 1 and 5),
  finished        boolean not null default false
);

comment on table public.fixture is
  'posture:reference — fixtures per gameweek. The only source of a fixture count; a projection never implies one.';

create index fixture_gameweek_idx on public.fixture (gameweek);

alter table public.fixture enable row level security;
grant select, insert, update on public.fixture to service_role;
revoke all on public.fixture from anon, authenticated;

-- ---------------------------------------------------------------------------
-- feed_read — one row per successful fetch of a feed.
-- ---------------------------------------------------------------------------
-- `raw` is kept because F6-UP-02 works from the last read and has to state how
-- old it is. **`raw` is storage, never prompt input** — sending bootstrap-static
-- to a model costs about $2 against a ~$0.07 budget (ADR 0009).

create table public.feed_read (
  id         uuid primary key default gen_random_uuid(),
  source     text not null check (source in ('fpl_bootstrap', 'fpl_fixtures', 'ffiq')),
  fetched_at timestamptz not null default now(),
  succeeded  boolean not null,
  raw        jsonb
);

comment on table public.feed_read is
  'posture:reference — one row per feed fetch. raw is storage, never prompt input.';

create index feed_read_source_fetched_idx on public.feed_read (source, fetched_at desc);

alter table public.feed_read enable row level security;
grant select, insert, update on public.feed_read to service_role;
revoke all on public.feed_read from anon, authenticated;

-- ---------------------------------------------------------------------------
-- player_state — the diffable per-player record, one set per feed_read.
-- ---------------------------------------------------------------------------
-- **For every player FPL tracks, not only the ones already inside a call.**
-- F6-RS-02 requires the diff to run across the whole record, and F6-RS-05
-- requires a player who was never proposed to be able to surface as a brand-new
-- candidate. Storing only squad players would make that impossible while looking
-- like it worked.
--
-- The five figures after now_cost_tenths are the stat table's (F1-AC-15). They
-- live here rather than being fetched and discarded so that the F6 refresh diff
-- can see form and ownership movement the way it already sees a price change,
-- without a second migration. Decided 2026-09-09.
--
-- Money is an integer in tenths of £1m, matching FPL's own now_cost. No float
-- ever holds money.

create table public.player_state (
  feed_read_id                 uuid not null references public.feed_read (id) on delete cascade,
  player_id                    integer not null references public.player (id),
  status                       text not null,
  news                         text,
  news_added                   timestamptz,
  chance_of_playing_next_round integer,
  now_cost_tenths              integer not null,
  form                         numeric(5, 2),
  selected_by_percent          numeric(5, 2),
  season_points                integer,
  transfers_in                 integer,
  transfers_out                integer,
  primary key (feed_read_id, player_id)
);

comment on table public.player_state is
  'posture:reference — per-player facts as at one feed read, for every player FPL tracks. The record F6 diffs.';

alter table public.player_state enable row level security;
grant select, insert, update on public.player_state to service_role;
revoke all on public.player_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- projection — one figure per player per gameweek, from Fantasy Football IQ.
-- ---------------------------------------------------------------------------
-- **There is no fixture dimension, by design.** That one figure already covers
-- however many matches the gameweek holds, which is what makes "nothing is summed
-- across fixture entries" structurally true rather than a convention someone has
-- to remember. F1-UP-02's "sum of both fixtures" describes the figure FFIQ
-- supplies, not an operation this code performs.
--
-- The feed is unauthenticated public HTTPS and needs no credential (STE-98).
-- Attribution to fantasyfootballiq.app is a licence condition (STE-53).

create table public.projection (
  gameweek         integer not null references public.gameweek (id),
  player_id        integer not null references public.player (id),
  projected_points numeric(5, 2) not null,
  feed_read_id     uuid not null references public.feed_read (id),
  primary key (gameweek, player_id)
);

comment on table public.projection is
  'posture:reference — one projected figure per player per gameweek. No fixture dimension, deliberately.';

alter table public.projection enable row level security;
grant select, insert, update on public.projection to service_role;
revoke all on public.projection from anon, authenticated;

-- ===========================================================================
-- USER DATA — owned by a person. Policy keyed to auth.uid(), and NOTHING to
-- service_role.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- squad_snapshot — the fifteen as at a moment.
-- ---------------------------------------------------------------------------
-- `gameweek` is the one this squad is *for*, and it is always is_next.
--
-- A correction replaces wholesale (F2-AC-04) by setting superseded_at rather than
-- deleting, so a disclosure line can never point at a squad that no longer
-- exists. `source` is what F8-AC-04's disclosure line reads.
--
-- Formation is derived from the starting eleven and never stored (F1-AC-03).
-- Squad and bench point totals are summed from the players shown and never stored
-- (F1-AC-22), so no total can disagree with the players it represents.

create table public.squad_snapshot (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  gameweek        integer not null references public.gameweek (id),
  source          text not null check (source in ('fpl_deadline', 'screenshot')),
  captured_at     timestamptz not null default now(),
  bank_tenths     integer not null,
  free_transfers  integer not null,
  chips_remaining jsonb not null,
  superseded_at   timestamptz
);

comment on table public.squad_snapshot is
  'posture:user — the fifteen as at a moment, and where they came from. Isolated by RLS on user_id.';

create index squad_snapshot_user_gameweek_idx
  on public.squad_snapshot (user_id, gameweek, superseded_at);

-- Redundant against the primary key on its own, and there so squad_player can
-- reference the *pair*. See that table for why.
alter table public.squad_snapshot add constraint squad_snapshot_id_user_key
  unique (id, user_id);

alter table public.squad_snapshot enable row level security;
alter table public.squad_snapshot force row level security;

create policy squad_snapshot_select_own on public.squad_snapshot
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy squad_snapshot_insert_own on public.squad_snapshot
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy squad_snapshot_update_own on public.squad_snapshot
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.squad_snapshot to authenticated;
revoke all on public.squad_snapshot from anon;
-- Nothing to service_role. ADR 0007, and the same line as `manager`: the service
-- key carries BYPASSRLS, so withholding the grant makes the rule a property of
-- the database rather than something a careless import can break.
revoke all on public.squad_snapshot from service_role;

-- ---------------------------------------------------------------------------
-- squad_player — the fifteen rows of one snapshot.
-- ---------------------------------------------------------------------------
-- Eleven starters and four bench, the bench in a fixed order: 0 for the
-- substitute goalkeeper, then 1, 2, 3 outfield (F1-AC-02).
--
-- **This table carries user_id, and cannot disagree with the snapshot's.**
--
-- The first draft left it out: ownership belongs to the snapshot, and duplicating
-- it looked like inviting a second answer to "whose row is this". Two things
-- changed that. The isolation suite reads every user-posture table generically and
-- expects a user_id, so an exception here would need a special case in the one
-- mechanism that catches a future table forgetting its policy — weakening it for
-- every table that comes after. And the duplication risk is removable rather than
-- merely acceptable: the foreign key below points at squad_snapshot's (id, user_id)
-- pair, so a row whose user_id disagrees with its snapshot's cannot be written at
-- all. Denormalised, and impossible to diverge.
--
-- purchase_price_tenths is nullable and that is an open question — STE-87, before
-- slice 5. F3-AC-25 derives the selling price from it and never stores that.

create table public.squad_player (
  snapshot_id           uuid not null,
  user_id               uuid not null,
  player_id             integer not null references public.player (id),
  is_starter            boolean not null,
  bench_order           integer check (bench_order between 0 and 3),
  is_captain            boolean not null default false,
  is_vice               boolean not null default false,
  purchase_price_tenths integer,
  primary key (snapshot_id, player_id),
  -- The pair, not the id. This is what makes user_id here unable to disagree with
  -- the snapshot's, and it is the whole reason the column is safe to duplicate.
  constraint squad_player_snapshot_fk foreign key (snapshot_id, user_id)
    references public.squad_snapshot (id, user_id) on delete cascade,
  -- A starter has no bench order and a bench player must have one. The shape the
  -- pitch depends on is enforced here rather than trusted from the feed.
  constraint squad_player_bench_order_matches_role
    check ((is_starter and bench_order is null) or (not is_starter and bench_order is not null)),
  -- Never both armbands on one row. "Never both false across the fifteen" is a
  -- set-level fact a row check cannot see, and is asserted in the unit tests.
  constraint squad_player_not_both_armbands check (not (is_captain and is_vice))
);

comment on table public.squad_player is
  'posture:user — the fifteen rows of one snapshot. Isolated by RLS on user_id, which the snapshot foreign key pins to the snapshot''s own.';

alter table public.squad_player enable row level security;
alter table public.squad_player force row level security;

create policy squad_player_select_own on public.squad_player
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy squad_player_insert_own on public.squad_player
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy squad_player_update_own on public.squad_player
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.squad_player to authenticated;
revoke all on public.squad_player from anon;
revoke all on public.squad_player from service_role;
