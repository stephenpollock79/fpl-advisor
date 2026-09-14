-- Refresh and regeneration (STE-65, F6). Additive only.
--
-- Everything here already exists in `docs/specs/architecture.md` §4.1 and has
-- simply never been created. The diff is the feature, and until these columns
-- exist it has neither a baseline to compare against nor anywhere to record what
-- it found.

-- ---------------------------------------------------------------------------
-- run — user. Which feed read this run actually saw.
-- ---------------------------------------------------------------------------
-- **This is the diff's anchor.** F6-RS-02 compares FPL's record now against
-- "what was on file at the last successful run", and nothing has ever recorded
-- which read a run was built from — so the comparison had no other side. A run
-- also becomes reproducible without re-fetching, which is what lets F6-RS-08
-- reuse a stored call and claim the figure is identical rather than close.
--
-- Nullable: runs written before this migration cannot be given one, and a null
-- baseline is read as "diff everything", which is the safe direction.

alter table public.run add column feed_read_id uuid references public.feed_read (id);

-- ---------------------------------------------------------------------------
-- call — user. What a refresh did to this call, until it has been seen.
-- ---------------------------------------------------------------------------
-- F6-AC-13: each affected call carries a transient tag on its own card until it
-- has been viewed. The transience is the point — without `viewed_at` the tag is
-- either permanent, which makes it meaningless, or client-only, which loses it
-- on every reload. Without them the diff is a sheet the manager dismisses and
-- then cannot find his way back to.
--
-- `previous_conviction` is what the band move is stated against — "was 84%, now
-- 71%" (F6-AC-11). Stored rather than derived, because the run that produced the
-- earlier figure may itself be several refreshes back.

alter table public.call add column diff_tag text
  check (diff_tag in ('new', 'updated', 'returned', 'resurfaced', 'band_move'));

alter table public.call add column previous_conviction integer
  check (previous_conviction between 5 and 95);

alter table public.call add column viewed_at timestamptz;

-- A band move has to say what it moved from; nothing else may claim one.
alter table public.call add constraint call_band_move_shape check (
  (diff_tag = 'band_move') = (previous_conviction is not null)
);

comment on column public.call.diff_tag is
  'Transient until viewed_at is set (F6-AC-13). Set by code from the recomputation, never by the model.';
