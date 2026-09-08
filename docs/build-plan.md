<!-- DERIVED FILE - DO NOT EDIT. Regenerate with extract-build-plan.py in the vault. -->
<!-- source: Build Plan - The FPL Advisor.md -->
<!-- source-sha256: ed4c1966eb83908c -->

# Build order and schedule

*Extracted verbatim from the Build Plan, which remains the single source of truth for order and dates. Edit the Build Plan in the vault, then regenerate - never edit this file.*

**This file owns order and dates. Linear owns state.** Read order and dates from here; write status to Linear. Never take a slice out of order: propose the change, stop, and wait for a ruling.

**Slices carry ticket identity; the schedule carries the day.** Alongside each day's slices are tickets that are not slices - decisions, spec work, housekeeping. Their detail is in Linear.

**Re-read this file at the start of every task.** It can change mid-session.

## Build order

Twelve slices, not nine features. F7 is not a feature you build once and the engine is not part of F3 —
both are spread or shared, and both were missing from the first draft of this plan because it was written
from the features under discussion rather than from the feature list.

| #   | Slice                    | Tier   | Build          | Tests     |
| --- | ------------------------ | ------ | -------------- | --------- |
| 1   | F7-core                  | Must   | STE-51, STE-52 | STE-58    |
| 2   | F7 team link             | Must   | STE-55         | —         |
| 3   | F1 Squad state           | Must   | STE-56         | STE-57    |
| 4   | **Engine**               | Must   | STE-60         | STE-61    |
| 5   | F3 Transfers and subs    | Must   | STE-62         | STE-63    |
| 6   | F4 Captain and vice      | Must   | STE-64         | —         |
| 7   | F6 Refresh               | Must   | STE-65         | —         |
| 8   | F8 Overview + F7-surface | Must   | STE-66         | —         |
| 9   | F2 Screenshot correction | Must   | STE-67         | —         |
| 10  | F7 hardening pass        | Must   | STE-68         | in STE-68 |
| 11  | F5 Chip season plan      | Should | STE-70         | —         |
| 12  | F9 Chip proposal         | Could  | STE-71         | —         |

Alongside these: **STE-53** (FFIQ attribution, ships with slice 3), **STE-54** (evaluate `predicted_starter` before the
engine slice opens), **STE-59** (set the cut trigger), **STE-69** (decide error monitoring). Deploy and
database setup are **STE-25**, **STE-29** and **STE-30**; context and skills are **STE-26** and **STE-28**.
Slices 2, 6, 7, 8, 9 and the two below the line carry their manual checklist inside the build ticket rather
than as a separate one.

The cut line sits after 10. That is the PRD's own tiering, not a judgement made here — F5 and F9 are the
only two features not Must.

**One dependency to settle before F8 is built, not after.** F8's priority line reaches F5's chip plan from
the Overview. Cutting F5 leaves a hole in the tab structure — survivable, but it is a layout consequence
rather than a clean removal.


## Schedule

**Dates live here and nowhere else in this document.** The build-order table above owns *order* and ticket
identity; this table owns *when*; Linear owns *state*. Read order from the table above, dates from here,
status from Linear — never restate one in another.

| Day | Slices | Alongside | Focus |
| --- | --- | --- | --- |
| **Tue 8** | 1 · F7-core (STE-51, STE-58) | STE-24, STE-78, STE-54, STE-59, STE-26, STE-75, STE-82, STE-84, STE-85 | Architecture spec; finish the foundations |
| **Wed 9** | 2 · F7 team link (STE-55) · 3 · F1 (STE-56, STE-57) | STE-32, STE-53, STE-31 | Spec F1 just-in-time, then build it |
| **Thu 10** | 4 · Engine (STE-60, STE-61) | STE-87, STE-88 | Headless, unit tests first |
| **Fri 11** | 5 · F3 (STE-62, STE-63) | — | The calls |
| **Mon 14** | 6 · F4 (STE-64) · 7 · F6 (STE-65) | STE-77 | Captaincy and refresh |
| **Tue 15** | 8 · F8 + F7-surface (STE-66) · 9 · F2 (STE-67) | STE-33 | The surface, then **call the MVP** |
| **Wed 16** | 10 · F7 hardening (STE-68) | STE-38, STE-69, STE-79, STE-80 | E2E week opens |
| **Thu 17** | — | STE-49, STE-50, STE-35, STE-37 | Engine watches; evals decided |
| **Fri 18** | — | STE-39, STE-36, STE-40 | **Launch — live run at the GW5 deadline, 18:30 UK** |
| not committed | 11 · F5 (STE-70) · 12 · F9 (STE-71) | — | Below the cut line |

**Four ordering constraints that are not obvious from the dates.**

- **STE-54 blocks slice 4.** If `predicted_starter` is usable, rotation becomes a bought-in input and the engine drops one of its four judgement inputs. It has to be answered Tuesday, not during Thursday's slice.
- **STE-58 sets the test-naming convention for the whole suite.** It is the first test in the repo, so the criterion-ID decision in STE-24 has to land before it is written.
- **Slice 4 has no acceptance criteria yet.** `ENGINE.criteria.md` carries zero `AC-` identifiers. Resolve before Thursday — either add them to PRD 3.2 and regenerate, or record that the worked example plus the unit tests are the standard.
- **STE-87 and STE-88 block slice 5.** Both surfaced writing the architecture spec, and both are questions the F3 build would otherwise default past rather than ask: where purchase prices are read from, and what the two probabilities in the vice and bench-order arithmetic actually are. Answer them Thursday, not during Friday's slice.

**After GW5 the next deadline is GW6, 10 October.** Slipping past Friday 18th costs a month, not days.
