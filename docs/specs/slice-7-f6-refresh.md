# Slice 7 — F6 Refresh and regeneration

Build **STE-65** · no test ticket · Monday 14 September · reads `docs/criteria/F6.criteria.md`, with `NFR.criteria.md` throughout. Rulings of 14 September are on STE-65. **Slice 6's cold review is not an input**: it is parked behind a manual checklist that this slice unblocks, and nothing here infers what it would have said.

## Seams

**The diff is pure, and it is the slice's seam.** Two feed reads in, a verdict out, under `apps/server/src/refresh/`. No clock, no network, no database — so every case the season will produce can be fabricated, which matters because none can be observed this week.

**Recomputation rides on `GET /api/world`, which already re-reads the feeds on every call.** It gains one thing: the stored calls' figures are re-derived from that read. **No model call, no new candidate, no change to any call's existence or decision state** — so `F6-AC-15`'s *nothing refreshes on its own* is intact. A refresh regenerates; recomputation keeps a displayed figure true to the data beside it (ruled 14 September).

**`POST /api/runs` becomes a hand-written SSE endpoint.** The Thinking state needs progress from a running job, and no framework here supplies streaming (ADR 0005, §6). Cancellation is `AbortController` plus request-close, which is what makes `F6-AC-20` true rather than claimed: an abandoned run writes nothing.

**Four storage additions, all specified and none built.** `run.feed_read_id` — the diff's baseline is *what was on file at the last successful run*, and nothing records which read a run saw, so the criterion has no anchor. `call.diff_tag`, `previous_conviction` and `viewed_at` carry the transient tags. Architecture §4.1 lists all four; additive, and reversed by dropping columns nothing else reads.

**No boundary is crossed.** `api.ts` stays the client's only data path and gains a stream reader; the engine is untouched; no new table, so no policy; the build split is unchanged.

**No blocking edges.** Slice 6 is merged and deployed; §8.4 (STE-110) falls after this day and F6 does not read the free-transfer count. The two decisions that were Stephen's were ruled before this spec was written.

## Modules

- `supabase/migrations/<ts>_f6_refresh.sql` — `run.feed_read_id`; `call.diff_tag`, `previous_conviction`, `viewed_at`.
- `apps/server/src/refresh/evidence.ts` — the diff: what moved since the baseline read.
- `apps/server/src/refresh/recompute.ts` — figures re-derived from published inputs, and what moved band.
- `apps/server/src/refresh/locks.ts` — selected as constraint, rejected as suppression, pending discarded.
- `apps/server/src/gameweek/guard.ts` — the deadline correctness stop.
- `apps/server/src/runs/routes.ts`, `generate.ts`, `wire.ts` — SSE, scope, trigger, reuse.
- `apps/server/src/world/routes.ts`, `load.ts` — recompute on read; the diff payload.
- `apps/client/src/api.ts` — the stream reader, and `GET /api/runs/:id/diff`.
- `apps/client/src/screens/Assistant/` — `Thinking`, the confirm interstitial, the diff sheet, the card tags, the refresh control.
- `tests/refresh/`, `tests/runs/`, `tests/client/`, `tests/e2e/`.

## Interfaces

**What counts as evidence** (`F6-RS-02`): per player, FPL's status code, the `news` line and its timestamp, the chance-of-playing figure, and price — compared against the read the last successful run saw, across every player FPL tracks, not only those already in a call (`F6-RS-05`). Any change counts; no magnitude threshold; elapsed time never counts (`F6-RS-04`).

**Two exclusions, both ruled 14 September.** FPL's daily **price-change forecast is code-only evidence**: re-read and re-evaluated for the WATCH flag at no cost, never a reason to offer a paid regeneration. It enters no figure on any card, so it cannot change what the advice is, and counting it would put a spend prompt on nearly every open. **The team-news sites in `F6-RS-03` are not read at all** — no feed exists, and building one is a new outside source with a licence question against a Friday launch. FPL's own injury fields carry the same facts within hours.

**Two gates, at two stages, and they are not the same.** The **offer** gate decides when a *paid* regeneration is proposed: a player crossing into or out of availability exclusion (ruled 10 September). The **report** gate decides what is shown after figures move: `F6-AC-06`'s crossing a band boundary, or no longer executable. Recomputation is free, so the report gate now fires without a spend — which is what makes the figures never drift from the data.

**On open**, in order: re-read the feeds, run the gameweek guard, recompute every stored call, tag what moved band, and offer a regeneration only if the offer gate fired (`F6-AC-13`).

**The gameweek guard is a stop, not a prompt.** If the stored gameweek's deadline has passed the advice is not stale, it is void, and the screen says so with no dismiss. Mixing correctness into a dismissible *want to refresh?* teaches the manager to click past a broken state.

**Locks.** A selected call is a constraint: its cash and free transfer are committed and its player is part of the squad (`F6-AC-01`). **For a swapped transfer the committed pair is the swapped one**, read from the decision's own key, not the originally proposed pair — the case slice 5 handed forward. Rejected calls are suppressed for the gameweek unless the premise materially changed, and a forced call ignores suppression outright (`F6-AC-05`).

**`POST /api/runs`** streams events — `step`, `progress`, `done`, `error` — each naming real figures (`F6-AC-17`, `F6-AC-18`). Closing the request cancels: the run is marked `cancelled`, no calls are written and the last-run time does not move. `GET /api/runs/:id/diff` returns the post-run report (`F6-AC-11`); an empty diff renders no sheet (`F6-AC-12`).

## Criteria in scope

**In scope — 29.** Re-scoring: `F6-RS-01`, `F6-RS-02`, `F6-RS-04`, `F6-RS-05`, `F6-RS-08` – `F6-RS-11`. Behaviour: `F6-AC-01` – `F6-AC-06`, `F6-AC-10` – `F6-AC-20`. Unhappy paths: `F6-UP-01` – `F6-UP-04`. **`F6-UP-04` is met by not building an in-session deadline clock**, which is what it asks for.

**Partial — 1.** `F6-AC-07`: the refresh control ships on the Assistant's tabs, scoped and naming its scope. Its overview scope is slice 8 (STE-66) and its chips scope slice 11 (STE-70).

**Left for a later slice — 5.** `F6-AC-08` and `F6-AC-09` need the Overview — slice 8, STE-66. `F6-RS-06` and `F6-RS-07` need the screenshot correction — slice 9, STE-67. **`F6-RS-03` has no data source and is not deferred to a slice**; it is ruled out of the MVP and needs a home, the same shape as WATCH's press-conference trigger.

## Verification

**Automated**, named per ADR 0010:

```ts
it('F6-RS-02, F6-RS-05: every tracked player is diffed, not only those in a call', …)
it('F6-RS-04: any change counts, and elapsed time alone never does', …)
it('F6-RS-08: no new evidence, no model call, and the figure is identical rather than close', …)
it('F6-AC-06: a band crossing is reported, a smaller move is silent', …)
it('F6-AC-01, F6-AC-04: selected calls constrain the next run, pending ones are rewritten', …)
it('F6-AC-03, F6-AC-05: a rejection is suppressed, and a forced call ignores it', …)
it('F6-AC-14, F6-AC-20, F6-UP-01: a failed or cancelled run never ages the advice', …)
it('F6-UP-03: a gameweek rollover keeps nothing and says so', …)
```

Plus the price forecast changing a WATCH flag while calling no model, and the swapped-transfer pair reaching the next run as the committed one. **Playwright:** the interstitial, the Thinking pipeline, cancellation, the diff sheet.

**Manual checklist, 390×844** (on STE-65):

1. Start a refresh and cancel it halfway. Every call, decision and the last-run time must be exactly as before — a cancelled run must be indistinguishable from one never started.
2. The Thinking state reads as work being done — one step running, real figures — not a spinner with words.
3. A `WAS 84%` tag survives leaving the tab and returning, and disappears once seen.
4. The refresh control names its own scope, so what a tap will rewrite is never ambiguous.

Nothing enters `docs/manual-coverage.md` until a check has run.

**Silent-failure items Stephen verifies (P7).** `is_next` — this slice adds the guard catching advice aimed at a gameweek already played, the failure that looks entirely normal; `data_checked`, for the same reason on last week's points; the **spend cap** — the diff gate is what keeps a refresh near zero, so the console balance after a week of refreshing is the check that it works. Row-level security is not on the list: no new table, no new policy.
