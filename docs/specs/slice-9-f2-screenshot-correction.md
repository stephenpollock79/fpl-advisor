# Slice 9 — F2 Correcting the squad from two screenshots

Build **STE-67** · no test ticket, so the checklist lives in the build ticket · Tuesday 15 September
· reads `docs/criteria/F2.criteria.md`, with `NFR.criteria.md` throughout. **P16 and P17 both apply**:
every test name carries its trigger, and every behaviour below names its value.

**From slice 8's review** (STE-66), third section. It closes one of its eight lines outright —
*"the editorial names the squad source the run actually used"*, which slice 8 hardcoded because
there was only one source. This slice makes the second source real. The other seven are slice 8's
own and are closed or homed already.

## Seams

**The parse is pure, and it is the slice's seam.** Two images in, a squad out, under
`apps/server/src/squad/parse.ts`: no network, no database, no clock. Every failure case
`F2-UP-01` names — four of fifteen legible, a missing free-transfer figure, the wrong screen
entirely — is fabricated, because none can be produced on demand from a real phone.

**The correction runs through F6's regeneration, never a path of its own** (`F2-AC-06`). It writes
a snapshot, then starts the existing streamed run with `trigger = 'screenshot_correction'`, which
`run`'s check constraint already allows. Selected calls survive and rejected ones stay suppressed
because the locks code is the same code.

**No images are stored.** They reach the model and are discarded. Keeping them would need a bucket,
a retention rule and a policy, and a migration to undo; wanting them later is a decision, not a
default.

**The model call is Haiku**, because ADR 0009 routes extraction there and reading a picture is
extraction. Its own pinned step, `parse`, so an upload's cost shows on the run record rather than
hiding inside the proposal count — the same reason the editorial got one.

**No migration in this slice.** `decision.broken_by_snapshot_id` already exists for `F2-AC-07`,
unread and unwritten since slice 5, and free transfers replace a derived integer in the column that
already holds one.

**No boundary is crossed.** `api.ts` stays the client's single data path and gains the upload; the
engine is untouched; no new table means no new policy; the build split is unchanged.

**No blocking edges.** Slice 8 is merged and deployed. Architecture §8.4 is this slice's to close,
not a prerequisite.

## Modules

- `apps/server/src/squad/parse.ts` — the two-image parse, and what a partial read does.
- `apps/server/src/squad/store.ts` — a snapshot whose source is a screenshot.
- `apps/server/src/squad/routes.ts`, `wire.ts` — `POST /api/squad/screenshots`.
- `apps/server/src/model/client.ts` — `readSquadScreenshots`, pinned to Haiku.
- `apps/server/src/refresh/locks.ts` — a contradicted lock broken and reported.
- `apps/client/src/api.ts` — the upload.
- `apps/client/src/screens/Squad/UploadSheet.tsx` — what is read from each picture, and the failure.
- `apps/client/src/screens/Squad/SquadScreen.tsx` — the *Update* control, inert since slice 3.
- `apps/client/src/calls/week.ts` — the squad-state line's screenshot reading.
- `tests/squad/parse.test.ts`, `tests/squad/screenshots.test.ts`, `tests/e2e/upload.spec.ts`.

## Interfaces

**`POST /api/squad/screenshots`** takes both images as base64 data URLs in one request — `team` and
`transfers` — and returns `{ snapshotId }`, after which the client starts a run exactly as the
refresh control does. **Each image is capped at 4 MB and downscaled client-side to 1600px on its
long edge before upload**; a phone screenshot is about 2 MB and two untouched ones would put 5.5 MB
of base64 in a single request body.

**All-or-nothing, and this is the whole list** (`F2-UP-01`): from the Team screenshot, fifteen
players, who starts, the bench order, the captain, the vice and the chip row; from the Transfers
screenshot, the bank and the free transfers. **Anything short of all of that applies nothing**, and
the failure screen names which screenshot fell short and what was missing from it.

**`source` is the string `screenshot`, singular.** That is what `squad_snapshot`'s check constraint
allows, and **slice 8's client compares against `screenshots`** — so F8-AC-04's screenshot line
cannot fire today. Correcting that spelling is this slice's, and its test takes the value from the
migration rather than typing it again.

**`picks_from` is set to the gameweek being advised, not left null.** `GET /api/world` retires a
snapshot whose `picks_from` is older than the last completed deadline, and reads null as stale — so
a corrected squad with a null there would be thrown away and re-read from FPL on the very next open,
silently undoing the upload.

**Free transfers come from the Transfers screenshot and replace the derivation** in
`freeTransfersRemaining()` (architecture §8.4, STE-110). Where a squad has no screenshot behind it
the derivation still stands; a parsed figure always wins, because it is read from a source that
states it.

**A contradicted lock is broken, never force-kept** (`F2-AC-07`, `F6-RS-07`): where the new squad
does not contain a selected call's incoming player, or still contains its outgoing one, the
decision row's `broken_by_snapshot_id` is set to the new snapshot and the call is reported through
the same refresh diff.

## Criteria in scope

**F2 — 11 of 11.** `F2-AC-01` – `F2-AC-08`, `F2-UP-01` – `F2-UP-03`. **`F2-UP-03` is met by not
building a denied state**, which is what it asks for.

**Handed forward and closed here — 2.** `F6-RS-06` and `F6-RS-07`, from slice 7 (STE-65).

**Closed elsewhere by this slice.** Architecture §8.4 and `F1-AC-07`'s gap row, once the
free-transfer figure is read rather than reconstructed. `F8-AC-04`'s screenshot reading becomes
reachable for the first time.

**13 in scope.** Nothing in `F2.criteria.md` is left for a later slice.

## Verification

**Automated**, each naming what causes its trigger:

```ts
it('F2-AC-01, F2-AC-02: the sheet states what each picture is read for before either is chosen', …)
it('F2-AC-04: a clean read of both replaces the fifteen wholesale, rather than diffing onto the old squad', …)
it('F2-UP-01: fourteen legible players applies nothing, and the failure names the Team screenshot', …)
it('F2-UP-01: a missing free-transfer figure applies nothing, and the failure names the Transfers screenshot', …)
it('F2-AC-06: a correction runs the same regeneration, so a selected call survives it and a rejected one stays out', …)
it('F2-AC-07, F6-RS-07: a screenshot that contradicts a selected call breaks that lock and reports it', …)
it('F6-RS-06: a correction is new evidence, so it regenerates rather than reusing', …)
it('F8-AC-04: a snapshot written by a correction reads as screenshots, with the value taken from the migration', …)
it('F1-AC-07: a parsed free-transfer figure wins over the reconstruction, and the reconstruction stands without one', …)
it('F2-AC-05: a successful read returns through the Thinking state rather than back to the squad', …)
```

**Playwright:** the sheet's two statements before any picture is chosen, the failure screen offering
the same upload actions again, and `F2-AC-08` — the Squad screen carrying no provenance indicator.

**Manual, 390×844** (checklist on STE-67):

1. Upload two real screenshots from the camera roll and check the fifteen that come back are
   actually yours (`F2-AC-03`). Nothing automated can read a real phone screenshot.
2. Upload the wrong screen and read the failure: it must name which picture, what was missing and
   the three common causes (`F2-UP-01`).
3. The Assistant's editorial then says the squad came from screenshots, with the upload time
   (`F2-AC-04`).

Nothing enters `docs/manual-coverage.md` until a check has run.

**Silent-failure items Stephen verifies (P7).** `is_next` — a corrected squad is written against the
gameweek being advised, and writing it against the wrong one puts a correct-looking squad under a
correct-looking deadline. **Row-level security is not on the list: no new table, no new policy.**
The spend cap gains one Haiku call per upload, and its check is the console balance.
