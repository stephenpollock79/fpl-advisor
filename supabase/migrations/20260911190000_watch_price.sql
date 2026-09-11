-- The price half of the WATCH flag (STE-117, F3-AC-17). Additive only.
--
-- FPL's own price-change forecast is in bootstrap-static, the feed ingestion
-- already reads: per player, progress toward a change and a likelihood from −5 to
-- +5 for tonight and the next two nights, plus a lock after a recent change. It is
-- FPL's forecast, consumed as the projections are — not a prediction model of ours.

-- ---------------------------------------------------------------------------
-- player_state — reference. Tonight's signal, as FPL publishes it.
-- ---------------------------------------------------------------------------
-- Only tonight's likelihood is stored: WATCH asks whether the price moves before
-- the manager's next chance to act, and the later nights are not what a call rests
-- on. Nullable, because rows read before this migration do not carry them.

alter table public.player_state add column price_change_percent numeric(7, 1);
alter table public.player_state add column price_change_likelihood_tonight smallint
  check (price_change_likelihood_tonight between -5 and 5);
alter table public.player_state add column price_change_locked_until timestamptz;

-- ---------------------------------------------------------------------------
-- call — user. Why WATCH is set, when it is.
-- ---------------------------------------------------------------------------
-- The flag reads WATCH with no qualifier; the reason is one tap away (F3-AC-18).
-- Set by code, never by the model, never from conviction. Null when not set.

alter table public.call add column watch_reason text;
