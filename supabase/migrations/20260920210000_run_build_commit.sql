-- Which build wrote this run (STE-185).
--
-- The reuse gate asks "has the world moved?" — it compares FPL's player records
-- and each stored call's own conviction band, and both are questions about
-- **data**. Neither can see that the code producing calls has changed underneath
-- it. So on 2026-09-20 the armband shipped as one ranked call, nothing in the
-- world had moved, and the gate reused the previous week for hours: the old
-- two-card captaincy screen survived every reload, and it read as the fix not
-- working.
--
-- A run is now stamped with the commit that produced it, and a run written by a
-- different build cannot be reused. **The server already knows this value** —
-- it prints it on boot — so there is no constant for anyone to remember to bump,
-- which is the half of this that would have been forgotten.
--
-- Nullable on purpose. Every run written before today has no stamp, and an
-- absent stamp counts as *different* rather than as *matching*: the first
-- refresh after this lands regenerates instead of trusting a blank.

alter table public.run add column if not exists build_commit text;

comment on column public.run.build_commit is
  'The commit that produced this run (STE-185). A run from another build cannot be reused; null is treated as a different build, never as a match.';
