-- player_state.penalties_order — any place in the queue, not only the first five.
--
-- The column was created with `check (penalties_order between 1 and 5)`, a guess
-- at how deep FPL's penalty order goes. On 2026-10-17 the feed listed a sixth
-- taker (Awoniyi), the check refused that one row, and the refused row took the
-- whole player_state write with it — so every feed read failed. Outside a
-- gameweek turnover that is caught and the world is answered from what is on
-- file; on the first open of GW8 it was not, and the app returned a 500.
--
-- The only reader asks whether a player is first choice (`=== 1`, runs/load.ts),
-- so how deep the queue goes changes no figure. The bound that matters is that a
-- place is positive; the feed owns how many places there are.

alter table public.player_state drop constraint player_state_penalties_order_check;

alter table public.player_state add constraint player_state_penalties_order_check
  check (penalties_order >= 1);
