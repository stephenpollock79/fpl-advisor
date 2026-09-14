# Manual coverage register

**Hand-maintained. This is the half of ADR 0010 a grep cannot do.**

`scripts/criteria-coverage.mjs` finds a criterion covered when its identifier appears in a test
name. That works for anything Vitest or Playwright can assert. It cannot work for the two kinds of
criterion this project deliberately does not automate:

- **Human checklist** — anything visual or tactile. CLAUDE.md's testing rule is explicit: write the
  checklist, do not fake it with a class-name assertion. A criterion about a swipe feeling right, a
  frozen column holding position, or a contrast ratio on a real screen belongs here.
- **Eval** — anything graded on model output rather than asserted. What the evals actually grade is
  still open (STE-37).

**One criterion per row.** `scripts/criteria-coverage.mjs` reads the first cell
and expects a single identifier in it; a row naming two is skipped, and until
2026-09-09 it was skipped *silently*. The script now warns about a row it cannot
read, but the format is still one per row — which is better anyway, because each
criterion then carries the note describing what was actually checked for it.

A row here is a claim that the criterion **has been verified**, with the date and where the record
is. It is not a plan to verify it later — an unverified criterion belongs in neither list, and the
coverage script counting it would make the number a lie.

| Criterion | Kind | Verified | Where the record is |
| --- | --- | --- | --- |
| F7-AC-11 | Human checklist | 2026-09-08 | Two real accounts on `fpl-advisor-dev`, signed in with real codes: neither could read, update or impersonate the other. Repeatable with `pnpm check:rls-live`. |
| F3-AC-21 | Human checklist | 2026-09-11 (2) | Re-checked by Stephen on an iPhone after #47, **in Chrome and in Safari**: the card fills the screen and the evaluation table is the only region that scrolls, freely in both directions, including with *How this was calculated* open. Held from the first pass because of a scroll stall, which turned out to be the **Google app's in-app browser**, not Chrome (STE-121). It persists there; ruled acceptable — the app is opened in Safari or Chrome. |
| F3-AC-07 | Human checklist | 2026-09-11 | Slice 5 checklist item 1, run by Stephen on an iPhone in Chrome at gaffercalls.com against the first production run. Swipe right selected and advanced, swipe left rejected, swipe up left the call pending. Results on STE-63. *Later* on the last undecided card has nothing to advance to and so does nothing visible — STE-122, slice 8. |
| F3-AC-08 | Human checklist | 2026-09-11 | Same pass, item 1. The three tiles under the card — Reject, Later, Select — perform the same three actions as the gestures. |
| F3-AC-11 | Human checklist | 2026-09-11 | Same pass, item 2. A rejected call stayed listed, dimmed, on Category cleared; one tap returned it to pending review and a second restored the rejection. |
| F3-AC-19 | Human checklist | 2026-09-11 | Same pass, item 3. The winning value in each row sat in a green pill — background, text and border — and the losing value was plain. |
| F3-AC-20 | Human checklist | 2026-09-11 | Same pass, item 3. Equal values carried no pill and a neutral "=" mark; *Selected by* never carried a pill. |
| F3-AC-22 | Human checklist | 2026-09-11 | Same pass, item 4. The Gaffer's line stayed within four lines on every card. `F3-AC-21`, checked in the same item, is **not** entered: the table intermittently refused to scroll back up (STE-121), and it waits for that fix and a re-check. |
| F3-AC-32 | Human checklist | 2026-09-11 | Same pass, item 5. The *this gameweek* row carried the fixture pill and three difficulty bars — this week and the next two. |
| F1-AC-20 | Human checklist | 2026-09-11 | Same pass, item 5 — the head-to-head fixtures row slice 3 left to slice 5. The three-bar strip renders on the card as on the stat table. |
| F3-AC-30 | Human checklist | 2026-09-11 | Same pass, item 6. *How this was calculated* on the Tzolis → Rogers card showed each side's projection, the gate verdicts, the weighted totals, the net and k, and they agreed with the card's own net. With the panel open the table scrolled only from a thin border strip — STE-121. |
| ENGINE-AC-05 | Human checklist | 2026-09-11 | Same pass, item 7. No label and no Gaffer line on any card described the strength figure as a probability, likelihood, chance or confidence. The source scan in `tests/client/surface-rules.test.ts` covers the strings; this covers what a person reads. |
| F7-AC-11 | Human checklist | 2026-09-11 | Slice 5 adds three user tables — `run`, `call`, `decision` — so the standing instruction applied: slice 5's migration pushed to `fpl-advisor-dev`, then `pnpm check:rls-live` run against it. **49/49**, all six user tables covered, including that `decision`'s delete grant reaches only the owner's rows and that the service key cannot reach any of the three. |
| F7-AC-11 | Human checklist | 2026-09-11 (2) | The same check against **`fpl-advisor-prod`**, after slice 5's migration was pushed there and confirmed applied by `supabase migration list` — before the merge, so the new code never met a database without its tables. `node scripts/live-rls-check.mjs --project=prod`: **49/49**, all six user tables covered; both throwaway accounts deleted and the remaining accounts listed. |
| F7-AC-11 | Human checklist | 2026-09-09 (3) | The check extended to every user table (STE-108) and re-run: **`fpl-advisor-dev` 28/28, covering `manager`, `squad_snapshot` and `squad_player`**. The table list is read from the migrations' posture comments, so a later slice cannot add a user table and leave this behind — a table with no seed recipe fails the run. Verified by removing one recipe and watching it fail. |
| F7-AC-11 | Human checklist | 2026-09-09 (3) | The same 28 checks against **`fpl-advisor-prod`**: all three user tables isolate on the deployed project. **This run required seeding three reference rows, which could not then be removed** — the reference tables grant no `delete`. The rows were cleared separately and the script no longer seeds: it now refuses to run where reference data is absent. So prod is **not** re-verifiable for the two squad tables until an ingest runs there. See `docs/coverage-gaps.md`. |
| F7-AC-11 | Human checklist | 2026-09-09 (2) | Re-run against `fpl-advisor-prod` after slice 3 deployed — 11/11, but **covering `manager` only**. Superseded by the two rows above; kept because it is the run that exposed the gap. |
| F7-AC-11 | Human checklist | 2026-09-09 | The same eleven checks against **`fpl-advisor-prod`**, the project serving gaffercalls.com — `node scripts/live-rls-check.mjs --project=prod`. 11/11. Asking for another user's row by id returns nothing, so the filter is not the protection; the service key is denied on user data entirely, withheld by grant; both throwaway accounts deleted afterwards. |
| F7-AC-04 | Human checklist | 2026-09-08 | A six-digit code arrived by email and was typed in. No tappable link, so no mail-client browser holds the session. Stephen received and read it. |
| F1-AC-21 | Human checklist | 2026-09-09 | The pitch carries the fixture pill alone, with no difficulty bars on any slot, and the bars appear only in the stat table. Checked on both screens. |
| F1-AC-04 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. Eleven starters visible with no page scroll. Took four attempts — a fixed pitch height, then shrinkable rows that overlapped each other, then badges reaching into the row above. |
| F1-AC-05 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. The four-player bench card visible at the same time as the eleven, without scrolling. |
| F1-AC-09 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. The *Update* control sits at the end of the chip row. It opens nothing yet — the squad-correction flow is F2, slice 9 — so only its presence and position are claimed here. |
| F1-AC-10 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. Kit, shirt number and surname on every slot. Numbers only after STE-112 found a source for them; before that every kit was blank. |
| F1-AC-14 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. No price appears anywhere on the pitch. The component is not given one, so it cannot show one by accident. |
| F1-AC-15 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. All ten master columns present, reached by scrolling the table sideways. |
| F1-AC-16 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. The player column stays pinned to the left while the table scrolls sideways. |
| F1-AC-17 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. The header row holds position while rows scroll vertically, and the position headings stay put rather than sliding off. |
| F1-AC-18 | Human checklist | 2026-09-09 | Checked on an iPhone in Chrome at the real viewport, not a simulator. Bench players carry S, S1, S2 and S3 beside the name in the stat table. |
| F7-AC-14 | Human checklist | 2026-09-09 | Real team ID entered on dev by Stephen. The confirm card named the team back, and accepting it stored the link — the screen then read "Linked to Noggingham Forest". The automated tests cover the mapping and that resolve stores nothing; this covers the half only a person can see, that the team is actually shown back before anything is written. |
| F7-AC-10 | Human checklist | 2026-09-08 | Full sign-in on dev: `expires_at` moved from 12:29:31 to 12:29:51 across two `/api/me` calls, so the window renews on each visit. The automated test covers only the cookie's shape. |
| F4-AC-01 | Human checklist | 2026-09-14 | Slice 6 checklist item 1, run by Stephen on his phone against live GW5 advice on `97bc6c7`. The Captain tab carried two calls — both proposing a change that week, so the keep card was not observable; `F4-AC-02` is therefore **not** entered here. |
| F4-AC-05 | Human checklist | 2026-09-14 | Same pass. The vice card carries the premise that the vice armband only pays if the captain does not play, and the captain card does not. The sentence is code's, not the model's, and sits on its own line so a long model line cannot push it off the card. |
| ENGINE-AC-05 | Human checklist | 2026-09-14 | Same pass, read across the Assistant's screens: nothing calls the strength figure a chance, a likelihood, a probability or a confidence. The automated half — a scan of every string the screens can show — closed on 2026-09-11; this is the half a scan cannot do. |
| F6-AC-16 | Human checklist | 2026-09-14 | Slice 7 checklist, same pass. A refresh entered the Thinking state and came back with the week's calls; the first run of the gameweek takes the same route since #69. |
| F6-AC-17 | Human checklist | 2026-09-14 | Same pass. The state names the process and states the scale in real figures — the fifteen in the squad and the ~650 players considered — rather than showing a spinner with words. |
| F6-AC-18 | Human checklist | 2026-09-14 | Same pass. The pipeline shows completed steps with their elapsed time, exactly one marked *running*, and the rest *queued*; no step's label contradicted its state. |
| F6-AC-19 | Human checklist | 2026-09-14 | Same pass, item 3: the state is cancellable for the whole of it, and cancelling returned the screen to its calls with every decision and the last-run time unchanged. **`F6-AC-20` is not entered** — the half about the run being *recorded* cancelled rather than failed is not visible from the phone, and `docs/coverage-gaps.md` carries it. |
| F6-AC-02 | Human checklist | 2026-09-14 | Checked on the live app after PR #77. A transfer was accepted, then a refresh run: the call came back reading as already selected rather than disappearing. **This is the half the e2e test never reached** — it asserts the badge on a fixed screen and runs no refresh, which is exactly where the rule was broken (`docs/coverage-gaps.md`). |
| F6-AC-03 | Human checklist | 2026-09-14 | Same pass. A second call was rejected and a refresh run: it did not come back. Its figures had not moved, which is the only condition under which it should return (F6-AC-06). **The returning half is not entered** — nothing resurfaced, so the *RESURFACED* label has not been seen on a real screen. |
| F6-RS-08 | Human checklist | 2026-09-14 | Checked on the live app after PR #79, which restored the gate using each stored call's own band. A second refresh straight after the first returned at once saying nothing behind the advice had moved. **Seeing that sentence is the check** — the run returns on that path before the model is reached, so there is no branch that says it and still spends. Stephen could not tell that from the screen, which he had already said once on the slice-7 pass; the message now says so. |

Gaps in what the automated suite proves are recorded separately, in
`docs/coverage-gaps.md` — a register of what *is* verified must not carry prose
about what is not.
