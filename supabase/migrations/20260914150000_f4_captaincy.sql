-- Captain and vice-captain calls (STE-64, F4). Additive, with one deliberate
-- relaxation named below.
--
-- `call.category` and `call.shape` already admit 'captaincy', 'captain' and
-- 'vice' — slice 5's migration anticipated them and nothing here touches those
-- checks.

-- ---------------------------------------------------------------------------
-- player_state — reference. Who takes his club's penalties, as FPL publishes it.
-- ---------------------------------------------------------------------------
-- The captaincy ceiling tie-break ranks by two published signals in order:
-- whether he takes penalties, then position (ENGINE, *Captaincy ceiling*). FPL
-- publishes an order, 1 to 5, and null for everyone else. Stored whole; the
-- engine's `takesPenalties` is `= 1`, a club's first-choice taker (ruled
-- 2026-09-14), because a fourth-choice taker does not take penalties and the
-- tie-break exists to reward a real ceiling.
--
-- Without this column `takesPenalties` could only be false for all fifteen. That
-- compiles, runs, produces a plausible armband, and silently reduces the
-- tie-break to position alone while `byCeiling` still reports that it fired.
-- Nullable, because rows read before this migration do not carry it.

alter table public.player_state add column penalties_order smallint
  check (penalties_order between 1 and 5);

-- ---------------------------------------------------------------------------
-- call — user. A keep reading is a call the app makes and the manager cannot act
-- on (F4-AC-01, F4-AC-02, F4-AC-03).
-- ---------------------------------------------------------------------------
-- F4 must advise on the armband every week, including the weeks when the advice
-- is to keep the holder. A keep carries no conviction and no band, by design —
-- ENGINE forbids rendering one as a weak change — so the three constraints
-- written for calls have to say "unless this is a reading".
--
-- **`net` stops being non-negative, and that is the one invariant this migration
-- narrows rather than extends.** `docs/specs/architecture.md` §4.1 said `net` is
-- "non-negative by construction — the winning side is the recommendation", and
-- that stays true of every *call*. It is not true of a reading: the ceiling
-- tie-break may put up a challenger as much as 0.125 points below the incumbent
-- (ENGINE, *Captaincy ceiling*), and an incumbent inside that floor still
-- resolves to a keep — with a negative net, which the breakdown shows. §4.1 is
-- corrected in the same change rather than left to disagree with the schema.
--
-- The three checks are mutually exclusive rather than permissive: a reading may
-- not carry a conviction, which is exactly the state F4-AC-02 says cannot exist.

alter table public.call add column is_reading boolean not null default false;

alter table public.call add column reading_reason text
  check (reading_reason in ('incumbent_wins', 'below_floor'));

alter table public.call alter column conviction drop not null;
alter table public.call alter column band drop not null;

alter table public.call drop constraint if exists call_net_check;
alter table public.call drop constraint if exists call_conviction_check;
alter table public.call drop constraint if exists call_band_check;

alter table public.call add constraint call_reading_shape check (
  case when is_reading
    then conviction is null and band is null and reading_reason is not null
    else conviction is not null and conviction between 5 and 95
      and band is not null and band in ('certain', 'strong', 'lean', 'thin')
      and reading_reason is null
      and net >= 0
  end
);

comment on column public.call.is_reading is
  'A keep reading — no change, nothing to do. Carries no conviction and no band, and enters no tally (F4-AC-02, F4-AC-03).';
