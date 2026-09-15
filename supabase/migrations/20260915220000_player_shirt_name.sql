-- The name FPL actually prints on the shirt (STE-67). Additive only.
--
-- **The squad screenshots show `web_name`, and this table only had
-- `second_name`.** For most players the two match; for a good few they do not
-- — Calafiori's second name is his full family name, João Pedro's is
-- "Junqueira de Jesus" — and the screenshot parse matches what it reads on a
-- shirt against the names in this table.
--
-- On 2026-09-15 that put two wrong players in a corrected squad: a defender
-- became one stranger, a forward became another and landed in midfield, and the
-- formation silently read 3-5-2 for a 3-4-3 side. **Nothing looked broken**,
-- which is the whole problem — a wrong match produces a plausible squad.
--
-- Nullable: rows written before this migration have no shirt name, and the
-- matcher falls back to the surname for them until the next ingest fills it.

alter table public.player add column shirt_name text;

comment on column public.player.shirt_name is
  'FPL''s web_name — what is printed on the shirt, and what a screenshot shows. Null on rows written before 2026-09-15.';
