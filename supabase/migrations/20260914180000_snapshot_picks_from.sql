-- Which gameweek's picks a snapshot actually holds (STE-65). Additive only.
--
-- **A snapshot has always recorded the gameweek it is *for* and never the
-- gameweek it was *read from*.** Those are different: the app advises on the
-- next gameweek and reads the squad from the last completed deadline, and the
-- gap between them is what F2's screenshot correction exists to close.
--
-- Without this column nothing can tell a current snapshot from a stale one. It
-- bit on 2026-09-14, the first gameweek rollover the app was ever open across:
-- a snapshot for gameweek 5 was captured from gameweek 3's picks because picks
-- were being read on the points rule. Fixing that rule fixed new captures and
-- could do nothing about the row already stored — the world finds a snapshot for
-- the gameweek it wants, so it never captures again, and the wrong squad stays
-- on screen with no way for the app to know.
--
-- Nullable: rows written before this migration cannot say where they came from,
-- and **unknown is treated as stale**, which re-captures once and then knows.

alter table public.squad_snapshot add column picks_from integer references public.gameweek (id);

comment on column public.squad_snapshot.picks_from is
  'The gameweek whose picks this holds. Null on rows written before 2026-09-14, and read as stale (F6-UP-03).';
