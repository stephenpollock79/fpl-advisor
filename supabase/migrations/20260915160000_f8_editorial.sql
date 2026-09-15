-- The Assistant Overview's editorial prose (STE-66, F8-AC-01, F8-AC-08). Additive only.
--
-- **Only the prose lives here.** Every figure the editorial card states — the
-- decided count, the priority tally, the squad-state line, the flagged summary
-- — is computed from the week's calls on each read and stored nowhere, because
-- a stored figure and a live one are two chances to disagree and F8-AC-06 is
-- the requirement that they cannot. What cannot be recomputed is a sentence the
-- model wrote, so that is what the column holds.
--
-- **Written by a run, read until the next one.** It belongs on `run` rather than
-- on a table of its own for the same reason the calls do: a run is the unit that
-- produced it, and a failed or cancelled run leaves the previous editorial
-- standing exactly as it leaves the previous advice (F6-UP-01, F8-UP-01).
--
-- Nullable: every run written before today has none, and a missing editorial
-- renders as the templated fallback rather than as an empty card.
--
-- No new table, so no new policy. `run` already carries `posture:user` and is
-- isolated by RLS on user_id from the migration that created it.

alter table public.run add column editorial text;

comment on column public.run.editorial is
  'The week in one read, in the assistant''s voice (F8-AC-08). Prose only — every figure on the card is recomputed. Null on runs before 2026-09-15 and where the model call failed.';
