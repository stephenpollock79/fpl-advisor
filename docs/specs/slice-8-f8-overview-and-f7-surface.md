# Slice 8 — F8 Assistant Overview + the F7 surface

Build **STE-66** · no test ticket, so the checklist lives in the build ticket · Tuesday 15 September
· reads `docs/criteria/F8.criteria.md` and `docs/criteria/F7.criteria.md`, with `NFR.criteria.md`
throughout. Rulings of 15 September are on STE-66. **P16 applies from here on.**

**From slice 7's review** (STE-65), third section: its four gaps are about slice 7's own subject and
none recur. What carries is their shape — *a value named as a behaviour and left for the build to
pick* — and this spec names every value. It does not close the last of them, when a run writes each
tag and what marks a card viewed: `F6-AC-13` is homed at STE-127, Post MVP.

## Seams

**The Overview is a fourth view inside the Assistant, not a new screen** — first and default beside
Transfers, Subs and Captain. Tabs already render from an array, so F5 appends its own if it is ever
built (STE-59).

**One list of live calls and one list of flagged players, computed once.** `F8-AC-06` makes that a
requirement, not a preference: the tally, the headline count and the flagged summary cannot disagree
only if they read the same two arrays. That derivation sits in `calls/` beside `nbal`, and is where
the slice is tested from. No component computes anything — `tests/client/surface-rules.test.ts`
already asserts it.

**The news token is derived, never stamped.** `GET /api/world` runs the same `diffEvidence` a run
runs, between the newest feed read and the one the last successful run saw. The token clears because
a run moves the baseline, not because anything writes a flag, so `F8-AC-17` is true by construction
— **the shape slice 7's review found missing** for tags a run wrote and nothing cleared.

**One additive column, `run.editorial`**, and the Landing screen replaces `SignIn` wholesale as that
file has said since slice 1. **No boundary is crossed**: `api.ts` stays the single data path and
gains `logout`, the engine is untouched, no new table means no new policy, the build split holds.

**No blocking edges.** STE-66's named blocker, the F5 knock-on, was settled on STE-59 and again this
morning: no Chips section, `F8-AC-34` to slice 11. Architecture §8.4 carries today's date and names
slice 9 — today's own work — as what closes it.

## Modules

- `supabase/migrations/<ts>_f8_editorial.sql` — `run.editorial`.
- `apps/server/src/world/news.ts` — the squad-scoped evidence diff behind the token.
- `apps/server/src/world/routes.ts`, `assemble.ts` — the `news` payload.
- `apps/server/src/model/editorial.ts` — the one prose call and its templated fallback.
- `apps/server/src/runs/generate.ts` — the editorial, written by a successful run.
- `apps/client/src/calls/week.ts` — live calls, tally, decided count, flagged players.
- `apps/client/src/calls/scenario.ts` — Before, After and the three totals for a filter.
- `apps/client/src/screens/Assistant/Overview.tsx` — editorial, squad widget, chips, cards, footer.
- `apps/client/src/screens/Assistant/NewsToken.tsx` — the token and its tooltip.
- `apps/client/src/screens/Assistant/AssistantScreen.tsx` — the Overview tab, the status bar.
- `apps/client/src/screens/Landing/` — replaces `screens/SignIn/`.
- `apps/client/src/screens/Account/AccountSheet.tsx` — the sheet and its log-out confirm page.
- `apps/client/src/api.ts` — `logout`, and the world's `news` field.
- `tests/world/news.test.ts`, `tests/client/week.test.ts`, `tests/client/scenario.test.ts`,
  `tests/e2e/overview.spec.ts`, `tests/e2e/landing.spec.ts`.

## Interfaces

**The world gains one field.** `news: { flagged: { playerId, fields, nowExcluded }[], since: string
| null }` — `fields` is the F6 diff's own four (`status`, `news`, `chance`, `price`), `since` is the
last successful run's finish time. Squad players only: `F8-AC-13` says *squad players*, and the
run's diff is league-wide.

**The token's verdict is built from FPL's own fields, not written by the model** (ruled 15
September): it fires exactly when news has landed and no run has consumed it, so model prose would
be missing at the only moment it is wanted, and writing it on tap spends outside the gate
`F6-RS-08` protects. The sentence comes from the status, the chance figure and whether he starts.

**The editorial is four computed lines plus one written paragraph.** Code produces the decided count
(`F8-AC-02`), the tally with the forced figure read from `call.isForced` and never a conviction
threshold (`F8-AC-03`), the squad-state line from `snapshot.source` and `capturedAt` (`F8-AC-04`),
and the flagged summary (`F8-AC-05`). **The blank-and-double lead is code's too** (`F8-AC-07`): a
criterion saying the editorial *must lead with it* cannot be met by a prompt. The model writes the
prose alone, from those lines and nothing else — a separate call, constrained the same way.

**Filters.** All; Forced Only; Forced and Recommended, meaning conviction ≥ 80, the *strong* and
*certain* bands; Selected. A filter hides and never recolours (`F8-AC-33`). **Under the three band
filters the After squad includes calls the manager rejected** (`F8-AC-25`), stated on screen in
words because it cannot be inferred. Selected is the only one that reads decisions.

**The widget's three totals** recompute per filter: projected points net of any hit, NBal for that
scenario through the existing `nbal`, and free transfers used against `snapshot.freeTransfers`,
turning red with the deduction at −4 per extra transfer (`F8-AC-11`, `F3-UP-02`).

**The refresh control moves into the status bar and reads ALL** (`F8-AC-12`, `F6-AC-07`). No
per-category control is added (`F6-AC-08`), and the token's refresh is the same all-scope run
(`F6-AC-09`) — which it already is, the server implementing no other.

**A card is two panels with a visible seam** (`F8-AC-28`), the decision panel having three states
(`F8-AC-29`). The *×2* or *BLANK* chip comes from the fixture list on either side, never from a
projection (`F8-AC-31`).

## Criteria in scope

**F8 — 37 of 38.** `F8-AC-01` – `F8-AC-33`, `F8-AC-35`, `F8-UP-01` – `F8-UP-03`.
**Deferred — 1.** `F8-AC-34`, the Chips section, to slice 11 (STE-70) with F5.

**F7 — 15.** `F7-AC-08`, `F7-AC-15`, `F7-AC-16` – `F7-AC-26`, `F7-UP-02`, `F7-UP-04`.
**Left for slice 10** (STE-68) **— 11.** `F7-AC-01` – `F7-AC-03`, `F7-AC-05` – `F7-AC-07`,
`F7-AC-09`, `F7-AC-12`, `F7-UP-01`, `F7-UP-03`, `F7-UP-05`.

**Handed forward and closed here — 11.** `F3-AC-06`, `F3-AC-10`, `F3-AC-29`, `F3-UP-01` –
`F3-UP-03`, `F3-UP-05`, `F4-AC-03`, `F6-AC-07` (overview scope), `F6-AC-08`, `F6-AC-09`.

**63 in scope.** The gap rows for `F7-AC-15` and the four F3 entries come out of
`docs/coverage-gaps.md` when this lands, not before.

## Verification

**Automated**, each naming what causes its trigger:

```ts
it('F8-AC-02, F8-AC-03, F8-AC-06: deciding one of seven calls moves count and tally together, off one list', …)
it('F8-AC-03: a forced call at 59% counts as forced, so the tally reads isForced not the band', …)
it('F8-AC-04: a snapshot sourced from screenshots states the upload time, not the deadline', …)
it('F8-AC-07: a squad whose club has no fixture makes the editorial lead with the blank', …)
it('F8-AC-13, F8-AC-17, F8-AC-18: a feed read differing from the run baseline raises the token, and a run consuming it clears it', …)
it('F8-AC-19: a raised token starts no run on its own', …)
it('F8-AC-20 – F8-AC-24: each chip over the same week yields its own set, and only Selected reads decisions', …)
it('F8-AC-25, F8-AC-26: a rejected call is inside the band filter’s After squad and still renders rejected', …)
it('F8-AC-10, F8-AC-11, F3-UP-01 – F3-UP-03: a scenario spending past bank, allowance and three-per-club states each breach', …)
it('F8-AC-31, F8-AC-32: two fixtures give ×2, none gives BLANK, and a filter hiding two of five ends with the dashed row', …)
it('F3-UP-05, F8-AC-01: a run producing no calls says why, with an empty tally and identical Before and After', …)
it('F7-AC-08: requesting a second code starts the cooldown and it counts down', …)
it('F7-AC-22, F7-AC-26: the account sheet lists no disabled row and no settings entry', …)
```

**Playwright**, on what exists only end to end: first open after a team link running into Thinking
(`F7-AC-15`); a stranger's first load (`F7-AC-16` – `F7-AC-19`, `F7-UP-04`); a wrong code giving an
inline red card, not a toast (`F7-AC-20`, `F7-UP-02`); the sheet opened from two screens and
cancelled back to each (`F7-AC-21`, `F7-AC-23`); log out through the confirm page to the Log in tab
(`F7-AC-24`, `F7-AC-25`); a decision changed from an Overview card (`F3-AC-10`, `F8-AC-29`,
`F8-AC-30`); the ALL refresh (`F8-AC-12`, `F6-AC-07` – `F6-AC-09`).

**Manual, 390×844** (checklist on STE-66):

1. The editorial reads as one person's view of the week, clamped to five lines, MORE opening it
   (`F8-AC-08`). Prose — nothing else can judge it.
2. Two mini pitches legible side by side, three totals moving together with the chip (`F8-AC-09`).
3. Each tooltip verdict is plainly true of the feed (`F8-AC-05`, `F8-AC-15`).
4. Nothing else on any screen announces the world has moved (`F8-AC-14`).
5. Landing's badge, five claims and disclaimer at this width (`F7-AC-16` – `F7-AC-19`); the footer
   hint centred under the last card (`F8-AC-35`).

Nothing enters `docs/manual-coverage.md` until a check has run; an unreachable trigger goes to
`docs/coverage-gaps.md` with a live owner instead of into a test name.

**Silent-failure items Stephen verifies (P7).** `is_next` — the Overview is the entry screen, so a
week advised on the wrong gameweek now looks confident on the first thing he sees. `data_checked` —
the editorial dates the squad, and a wrong date is invisible. **Row-level security is not on the
list: no new table, no new policy.** The spend cap gains one prose call per run; its check is the
console balance, not a test.
