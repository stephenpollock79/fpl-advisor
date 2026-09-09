# Slice 3 — F1 Squad state

Build **STE-56** · tests **STE-57** · Wednesday 9 September · reads `docs/criteria/F1.criteria.md`, with `NFR.criteria.md` applying throughout. **STE-53** (Fantasy Football IQ attribution) ships inside it.

## Seams

**Two, and both already exist in some form.**

**Ingestion takes payloads, not URLs.** The modules under `apps/server/src/ingest/` are pure: parsed FPL and FFIQ objects in, rows out, no fetch and no clock inside. That is where STE-57 works, and the only way blanks and doubles can be tested at all — neither is observable live this early in a season, so both are fabricated.

**Row-level security reuses slice 1's seam.** `tests/rls/isolation.test.ts` runs the real migrations against real Postgres and already fails on any table in `public` whose posture is not declared as a comment. The two new user tables are caught by a mechanism that exists; nothing new is built.

Pure display helpers are unit-tested directly. Everything visual is a manual checklist, never a class-name assertion.

**None of the four architecture boundaries is crossed.** The client's only data path stays `apps/client/src/api.ts`; `packages/engine` is untouched; user data is read with the signed-in user's token and reference data with the service key; the build split is unchanged.

**One storage-shape decision, taken 2026-09-09.** `player_state` gains five columns for the stat table's figures (`F1-AC-15`), so the F6 refresh diff can later see form and ownership movement the way it already sees a price change, without a second migration.

**No blocking edges.** Slice 2 (STE-55) has not landed and is the same day: it populates `manager.fpl_team_id`, which this slice reads. It supplies one integer, not a data path. STE-87 and STE-88 (§8.1, §8.2) fall before slice 5; §8.3 is slice 4's.

## Modules

- `supabase/migrations/<ts>_f1_squad_state.sql` — nine tables. Reference: `gameweek`, `club`, `player`, `fixture`, `projection`, `feed_read`, `player_state`. User: `squad_snapshot`, `squad_player`.
- `apps/server/src/feeds/fpl.ts` — `bootstrap-static`, `fixtures`, `entry/{id}/event/{gw}/picks`.
- `apps/server/src/feeds/ffiq.ts` — the two public `/data/` files.
- `apps/server/src/ingest/gameweeks.ts`, `fixtures.ts`, `players.ts`, `projections.ts` — pure, payload in, rows out.
- `apps/server/src/squad/snapshot.ts` — picks to fifteen rows.
- `apps/server/src/routes/world.ts` — `GET /api/world`.
- `apps/server/src/supabase.ts` — extended with a signed-in-user client beside the service client.
- `apps/client/src/api.ts` — `fetchWorld`, added to the one data path.
- `apps/client/src/world/WorldContext.tsx` — the single context (§11).
- `apps/client/src/screens/SquadState/` — `Header`, `Pitch`, `Bench`, `StatTable`, `PlayerSlot`, `FixturePill`, `DifficultyBars`, `Attribution`.
- `apps/client/src/squad/format.ts` — formation, surname, bench order. Not the engine: these are not net, conviction or band.
- `apps/client/src/tokens.css` — the handoff's palette as custom properties.

## Interfaces

**`GET /api/world`** returns one object; every screen re-derives from it (§6).

```ts
type World = {
  gameweek: { id: number; name: string; deadlineTime: string }  // is_next
  lastCompleted: { id: number; dataChecked: boolean }
  snapshot: { id, source, capturedAt, bankTenths, freeTransfers, chipsRemaining }
  players: WorldPlayer[]
  blanks: number; doubles: number                    // F1-UP-01, F1-UP-02
  attribution: { href: 'https://fantasyfootballiq.app' }
}
type WorldPlayer = {
  playerId, surname, shirtNumber, clubId, position
  isStarter: boolean; benchOrder: 0|1|2|3|null       // F1-AC-02
  isCaptain, isVice: boolean                          // F1-AC-13
  status: string; chanceOfPlayingNextRound: number|null  // F1-AC-12
  nowCostTenths, form, selectedByPercent, seasonPoints, transfersIn, transfersOut
  projectedPoints: number
  fixtures: { opponentClubId, isHome, difficulty }[]  // length 0, 1 or 2
  nextThree: (number|null)[]                          // F1-AC-19; null is a blank
}
```

**Three rules the criteria imply but do not spell out.**

**A double is never summed** (`F1-UP-02`). It is FFIQ's single figure for the gameweek, already covering both matches; `projection` has no fixture dimension, so there is nothing to add. Fixture count comes from `fixtures.length` alone, never a projection's size or presence; a club with no fixture projects `0.0` whatever the feed carries (`F1-UP-01`). Any club with other than one fixture is logged.

**`ep_next` is never a fallback.** If FFIQ is unreachable, projections are absent, not substituted. Measured 2026-09-02, it equalled `form` for 214 of 217 players, with no fixture, opponent, venue or minutes term — a different quantity, and substituting it degrades advice while looking fine.

**Neither feed sends CORS headers**, so the server fetches and the client calls our own origin. Physical, not preferential.

**Migration.** `squad_snapshot` and `squad_player` are user data: policies keyed to `user_id` in the creating migration, no grant to `service_role`. The seven reference tables get RLS enabled, no policy, `select` to `service_role` only. Every table declares its posture as a comment. `squad_player.purchase_price_tenths` stays nullable (§8.1). `player_state` carries the five stat figures alongside `now_cost_tenths`.

**Components.** `<Pitch>` renders goal at top, keeper in the area, forwards at the bottom, and **never receives price** (`F1-AC-14`). `<FixturePill>` colours 1–2 green, 3 amber, 4–5 red (`F1-AC-11`); `NO GAME` grey on a dashed border for a blank; `×2` green for a double. `<DifficultyBars>` renders three hairline bars **in the stat table only, never on a slot** (`F1-AC-19`, `F1-AC-21`); a blank is an empty dashed track, a double splits the first bar. Surnames over eleven are cut at ten and closed with a full stop at render; every lookup keys off the untruncated name (`F1-UP-03`).

## Criteria in scope

**In scope — 24.** Squad and bench: `F1-AC-01`, `F1-AC-02`, `F1-AC-03`, `F1-AC-04`, `F1-AC-05`, `F1-AC-18`, `F1-AC-22`. Header: `F1-AC-06`, `F1-AC-07`, `F1-AC-08`, `F1-AC-09`. Slot: `F1-AC-10`, `F1-AC-11`, `F1-AC-12`, `F1-AC-13`, `F1-AC-14`, `F1-AC-21`. Stat table: `F1-AC-15`, `F1-AC-16`, `F1-AC-17`, `F1-AC-19`. Unhappy: `F1-UP-01`, `F1-UP-02`, `F1-UP-03`.

`F1-AC-09` ships the control only; what it opens is F2, slice 9 (STE-67).

**Left for a later slice — 2.** `F1-AC-20`, the head-to-head fixtures row — F3, slice 5 (STE-62). `F1-UP-04`, which resolves to F6 — slice 7 (STE-65).

`NFR.criteria.md` declares no identifiers and is not counted.

## Verification

**Automated**, named per ADR 0010:

```ts
it('F1-AC-01, F1-AC-02, F1-AC-03, F1-AC-22: fifteen, eleven starters, bench GK then 1-3, formation derived, totals summed', …)
it('F1-AC-11, F1-AC-19: difficulty 1-2 green, 3 amber, 4-5 red, on pill and bars', …)
it('F1-UP-01, F1-UP-02: a blank projects 0.0 whatever the feed carries; a double is never summed; either is logged', …)
it('F1-UP-03: surnames over eleven cut at ten; lookups key off the full name', …)
```

Plus in `tests/rls/isolation.test.ts`: the two new tables isolate user from user; `service_role` is denied on both.

**Manual checklist**, on a phone at 390×844:

1. Eleven starters and the bench card both visible without scrolling (`F1-AC-04`, `F1-AC-05`).
2. Header: deadline, Balance, free transfers, four chip discs, *Update* at the row's end; available tells from spent **in greyscale** (`F1-AC-06`, `F1-AC-07`, `F1-AC-08`, `F1-AC-09`; NFR Accessibility 3).
3. Each slot: kit, number, surname, injury/doubt marker, captain and vice badges, a fixture pill and **no bars**; **no price** anywhere (`F1-AC-10`, `F1-AC-12`, `F1-AC-13`, `F1-AC-14`, `F1-AC-21`).
4. Bench badges read S, S1, S2, S3 (`F1-AC-18`); the Fantasy Football IQ link opens (STE-53, a licence condition).
5. Stat table: all ten columns (`F1-AC-15`); scroll sideways, the player column stays pinned; down, the header row holds (`F1-AC-16`, `F1-AC-17`).

Nothing enters `docs/manual-coverage.md` until a check runs.

**Silent-failure items Stephen verifies himself (P7).** Four of five, here: RLS on the two new user tables (`pnpm test`, `pnpm check:rls-live`); `is_next` not `is_current`; `data_checked` not `finished`; fixture count never from a projection. The spend cap is untouched — F1 makes no model call.
