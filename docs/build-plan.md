<!-- DERIVED FILE - DO NOT EDIT. Regenerate with extract-build-plan.py in the vault. -->
<!-- source: Build Plan - The FPL Advisor.md -->
<!-- source-sha256: 198286410affd7c6 -->

# Build order

*Extracted verbatim from the Build Plan, which remains the single source of truth for order and dates. Edit the Build Plan in the vault, then regenerate - never edit this file.*

**This file owns order and dates. Linear owns state.** Read order from here; write status to Linear. Never take a slice out of order: propose the change, stop, and wait for a ruling.

**Re-read this file at the start of every task.** It can change mid-session.

Twelve slices, not nine features. F7 is not a feature you build once and the engine is not part of F3 —
both are spread or shared, and both were missing from the first draft of this plan because it was written
from the features under discussion rather than from the feature list.

| # | Slice | Tier | Build | Tests | Day |
| --- | --- | --- | --- | --- | --- |
| 1 | F7-core | Must | STE-51, STE-52 | STE-58 | Fri 4 |
| 2 | F7 team link | Must | STE-55 | — | Mon 7 |
| 3 | F1 Squad state | Must | STE-56 | STE-57 | Mon 7 |
| 4 | **Engine** | Must | STE-60 | STE-61 | Tue 8 |
| 5 | F3 Transfers and subs | Must | STE-62 | STE-63 | Wed 9 |
| 6 | F4 Captain and vice | Must | STE-64 | — | Wed 9 |
| 7 | F6 Refresh | Must | STE-65 | — | Thu 10 |
| 8 | F8 Overview + F7-surface | Must | STE-66 | — | Thu 10 |
| 9 | F2 Screenshot correction | Must | STE-67 | — | Fri 11 |
| 10 | F7 hardening pass | Must | STE-68 | in STE-68 | Fri 11 |
| 11 | F5 Chip season plan | Should | STE-70 | — | not committed |
| 12 | F9 Chip proposal | Could | STE-71 | — | not committed |

Alongside these: **STE-53** (FFIQ attribution link), **STE-54** (evaluate `predicted_starter` before the
engine slice opens), **STE-59** (set the cut trigger), **STE-69** (decide error monitoring). Deploy and
database setup are **STE-25**, **STE-29** and **STE-30**; context and skills are **STE-26** and **STE-28**.
Slices 2, 6, 7, 8, 9 and the two below the line carry their manual checklist inside the build ticket rather
than as a separate one.

The cut line sits after 10. That is the PRD's own tiering, not a judgement made here — F5 and F9 are the
only two features not Must.

**One dependency to settle before F8 is built, not after.** F8's priority line reaches F5's chip plan from
the Overview. Cutting F5 leaves a hole in the tab structure — survivable, but it is a layout consequence
rather than a clean removal.
