-- The armband becomes one call carrying a ranking, not two swaps (STE-151).
--
-- `chooseArmband` has always ranked the eligible starters and taken the top
-- two. Everything downstream translated that back into a captain swap and a
-- vice swap, and the translation is where it went wrong: five editorials
-- describing the armbands wrongly, a vice call outscoring its own captain call,
-- and a figure on the vice that read as points banked when it is collectable
-- only in a week the captain does not play.
--
-- Additive, and deliberately so. **`captain` and `vice` stay allowed** — the
-- shape is stored on every call ever written, and removing them would make the
-- season's own history unreadable. Nothing produces them from today.

-- **Dropped by discovery, not by guessed name.** The original is an inline
-- column check, so Postgres named it itself. A `drop ... if exists` on a guessed
-- name that turns out wrong does nothing, silently, and the new constraint then
-- sits beside an old one that still refuses 'armband' — a migration that reports
-- success and blocks every run.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.call'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%bench_order%'
  loop
    execute format('alter table public.call drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.call add constraint call_shape_check check (shape in (
  'transfer', 'forced_swap', 'doubt_swap', 'upgrade_swap', 'bench_order',
  'armband',
  -- Written before 2026-09-20. Readable, never written again.
  'captain', 'vice'
));
