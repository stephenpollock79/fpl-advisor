-- Feed values keep only the bounds the app needs, not the range we guessed FPL uses.
--
-- On 2026-10-17 a 1–5 check on penalty order met a sixth taker, refused one row,
-- and failed every feed read for the day (20261017230000). Two more columns carry
-- the same kind of guess, and either would fail the same way:
--
--   fixture difficulty         1–5    FPL's scale today; nothing here needs a ceiling
--   price-change likelihood   −5–+5   WATCH compares it to a threshold, either sign
--
-- Difficulty keeps "at least 1", because the engine averages it and a zero or a
-- negative would be a wrong figure rather than an unfamiliar one. Likelihood keeps
-- no bound: any integer reads correctly against the threshold.
--
-- Position keeps its four values. The app genuinely knows only four, and an
-- element of any other type is now skipped before it reaches this table
-- (ingest/players.ts, STE-198) rather than failing the read.
--
-- No `if exists`: these are the names Postgres gave the inline checks, and a name
-- that does not match should fail the push loudly, not leave the old bound in place.

alter table public.fixture drop constraint fixture_home_difficulty_check;
alter table public.fixture drop constraint fixture_away_difficulty_check;
alter table public.fixture add constraint fixture_home_difficulty_check check (home_difficulty >= 1);
alter table public.fixture add constraint fixture_away_difficulty_check check (away_difficulty >= 1);

alter table public.player_state drop constraint player_state_price_change_likelihood_tonight_check;
