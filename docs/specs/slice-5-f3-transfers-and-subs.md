# Slice 5 — F3 Transfers and substitution calls

Build **STE-62** · tests **STE-63** · Friday 11 September · reads `docs/criteria/F3.criteria.md` and `ENGINE.criteria.md`, with `NFR.criteria.md` throughout. Rulings of 11 September are on STE-62; gaps logged as STE-116 and STE-117.

## Seams

**Plan generation is pure.** World in, calls out, under `apps/server/src/calls/`. That is where the week's two real traps are tested with GW4's own shapes: *Shaw out, Rogers in* leaves two defenders and must never be produced, and Tzolis is wanted by a substitution and a transfer at once (`F3-UP-04`).

**The model sits behind one module with a first-class mock mode** (ADR 0008). Every integration test runs in mock mode; one named test reaches a real model. Mock mode is also the fallback when the model returns nothing usable, so the plan never depends on the model to exist.

**Row-level security reuses slice 1's seam.** Three new user tables are caught by `tests/rls/isolation.test.ts`, and `check:rls-live` gains their seed recipes.

**Client flows run under Playwright** against intercepted `/api/*` fixtures. Everything visual is a manual checklist.

**No boundary is crossed.** `api.ts` stays the client's only data path; the engine gains a parameter and a variant, never a dependency; user data is read as the user; the build split is unchanged.

**No blocking edges.** STE-87 and STE-88 are closed; slice 4 has landed.

## Modules

- `supabase/migrations/<ts>_f3_calls.sql` — user: `run`, `call`, `decision`; reference: `player_state.cost_change_start_tenths`.
- `packages/engine` — substitution variant `upgrade`; `evaluateCall` parameter `incumbentUnplayable`.
- `apps/server/src/squad/snapshot.ts` — `purchasePrices`; `store.ts` reads `entry/{id}/transfers/`.
- `apps/server/src/calls/` — `legal-xi.ts`, `transfers.ts`, `plan.ts`, `reasoning-template.ts`.
- `apps/server/src/model/` — the one module; three routes: `api` in production, `agent-sdk` locally, `mock` (ADR 0008, amended 11 September).
- `apps/server/src/runs/` — `POST /api/runs`.
- `apps/server/src/decisions/` — `POST /api/decisions`.
- `apps/server/src/world/` — calls, decisions and selling prices added to the world.
- `apps/client/src/api.ts` — `startRun`, `decide`, `reopen`.
- `apps/client/src/calls/` — decisions reducer, row winners, NBal, local recompute. Helpers, not components.
- `apps/client/src/screens/Assistant/` — `StatusBar`, `HeadToHead`, `EvalTable`, `SwipeTiles`, `Breakdown`, `CandidatePicker`, `CategoryCleared`.
- `playwright.config.ts`, `tests/e2e/`.

## Interfaces

**`POST /api/runs`** → `{ runId, calls: Call[] }`. Plain JSON; F6 adds streaming, the Thinking state and cancellation. `GET /api/world` gains `calls`, `decisions` and, per player, `purchasePriceTenths` and `sellingPriceTenths` — the second from the engine's `sellingPriceTenths`, never re-derived in the client.

```ts
type Call = {
  key: string; category: 'transfer' | 'substitution'
  shape: 'transfer' | 'forced_swap' | 'doubt_swap' | 'upgrade_swap' | 'bench_order'
  outPlayerId: number; inPlayerId: number
  net: number; conviction: number; band: Band; k: number; pointsHit: number
  costTenths: number; isForced: boolean; watch: false         // STE-117
  reasoning: string; reasoningSource: 'model' | 'template'
  alternatives?: { out: number[]; in: number[] }              // F3-AC-23: 3 and 5
}
```

`run.model_calls` is `jsonb`: model id, step, tokens and cost per call. `decision` is keyed `(user_id, gameweek, call_key)`. `POST /api/decisions` takes `{ callKey, state: 'selected' | 'rejected' | 'pending' }`; pending is no row, so it deletes (`F3-AC-14`).

**Purchase price** (`F3-AC-26`, STE-87): the latest `element_in_cost` per player from `entry/{id}/transfers/`, skipping Free Hit gameweeks; else `now_cost − cost_change_start`. A snapshot missing prices is backfilled on read.

**Substitutions are a legal-XI search** (`F3-AC-03`). The best eleven from fifteen by this gameweek's projection, subject to FPL's shape rules and the availability gate; the difference from the current eleven is paired into swaps that keep the shape legal. The variant is `forced` when the starter fails the gate or has no fixture, `doubt` when flagged but eligible, `upgrade` otherwise (STE-116). Bench order is `benchOrder` from the engine and nothing else (`ENGINE-AC-06`); in a blank week it leads the category (`F3-AC-06`).

**The model proposes transfers only**, choosing from a code-built shortlist of named fields — never raw `bootstrap-static` (ADR 0009). Code validates, evaluates and drops no-change readings. Haiku proposes; Sonnet writes reasoning from the card's table values alone (`F3-AC-22`); a blocklisted word falls back to the template.

**One plan** (`F3-UP-04`): forced first, then conviction, then player id; a call touching a held player is re-searched without it. Transfers beyond the free allowance, in descending net, carry the hit in their own net.

**Forced with no better replacement** shows conviction 5 and a net of 0.00, never a negative (slice 4 review).

**Card** (`F3-AC-16`, `F3-AC-21`): versus band, summary strip (net, **strength**, band word, cost, NBal), one flag, evaluation table, reasoning, three tiles. Conviction is labelled "strength" everywhere (`ENGINE-AC-05`). Row winners, NBal and the candidate recompute live in `calls/`; components receive values.

## Criteria in scope

**In scope — 32, plus two engine criteria.** State: `F3-AC-01`, `F3-AC-02`, `F3-UP-06`. Shapes: `F3-AC-03`, `F3-AC-04`, `F3-AC-05`, `F3-UP-07`. Gestures and flow: `F3-AC-07`, `F3-AC-08`, `F3-AC-09`, `F3-AC-11`, `F3-AC-12`, `F3-AC-13`, `F3-AC-14`, `F3-AC-15`. Card: `F3-AC-16`, `F3-AC-18`, `F3-AC-19`, `F3-AC-20`, `F3-AC-21`, `F3-AC-22`, `F3-AC-30`, `F3-AC-31`, `F3-AC-32`, `F3-AC-33`. Picker and money: `F3-AC-23`, `F3-AC-24`, `F3-AC-25`, `F3-AC-26`, `F3-AC-27`, `F3-AC-28`. Plan: `F3-UP-04`. Engine: `ENGINE-AC-04` (surface half), `ENGINE-AC-05`.

**Partial — 5.** `F3-AC-17` (Watch half: STE-117). `F3-AC-06`, `F3-AC-29`, `F3-UP-01`, `F3-UP-05` (Overview halves: slice 8, STE-66).

**Left for slice 8 — 3.** `F3-AC-10`, `F3-UP-02`, `F3-UP-03`, all on STE-66.

**From another file — 1.** `F1-AC-20`, the head-to-head fixtures row, left to this slice by slice 3's spec.

## Verification

**Automated**, named per ADR 0010:

```ts
it('F3-AC-03: forced, doubt, upgrade; Shaw out for Rogers never produced', …)
it('F3-UP-04: no two calls touch one player', …)
it('F3-AC-25, F3-AC-26: element_in_cost, gameweek-1 fallback, Free Hit skipped', …)
it('F3-AC-01, F3-AC-02, F3-AC-14: decisions per call; reopen and restore', …)
it('F3-AC-22: a blocklisted line falls back to the template', …)
it('ENGINE-AC-04, ENGINE-AC-05: no component computes or mislabels conviction', …)
```

Plus the pinned model identifier per call, and isolation for the three tables. **Playwright (STE-63):** `F3-AC-12`, `F3-AC-13`, `F3-AC-14`, `F3-AC-15`, `F3-AC-24`.

**Manual checklist**, at 390×844:

1. Swipes do what their tiles say (`F3-AC-07`, `F3-AC-08`).
2. A rejected card stays dimmed with its panel (`F3-AC-11`).
3. Green pill on the winner, plain loser, neutral tie (`F3-AC-19`, `F3-AC-20`).
4. Only the table scrolls; reasoning fits four lines (`F3-AC-21`, `F3-AC-22`).
5. Three-bar strip on the fixtures row (`F3-AC-32`, `F1-AC-20`).
6. *How this was calculated* traced by hand (`F3-AC-30`).
7. Strength never reads as a chance (`ENGINE-AC-05`).

Nothing enters `docs/manual-coverage.md` until a check runs.

**Silent-failure items Stephen verifies (P7).** RLS on the three tables (`pnpm check:rls-live`, both projects); `is_next`; a no-fixture starter is forced, never re-scored; **the spend cap, first touched here** — read the console balance before and after the first production run; the model pin, read off the `run` row (ADR 0008).
