# Working rules — FPL Advisor

**The general contract lives in `~/.claude/CLAUDE.md`, outside this repo, and loads into every
session automatically.** It holds the reader, the five reply types, verification, scope, the ask
gates and the repo boundary, numbered `G1…`. This file holds only what is true of *this* project,
numbered `P1…`. Nothing is stated in both places: if you are looking for a rule and it is not
here, it is a `G` rule.

Agreed 2026-09-03/04, split 2026-09-04 (STE-83). It is expected to change after the first few
slices — say so if a rule is getting in the way rather than quietly dropping it.

**The unit of work (G10) is a slice.** One slice, one session.

## A. Source of truth

**P1. `docs/build-plan.md` owns order and dates.** Day, sequence, slice. It is a derived file
generated from the Build Plan in Stephen's vault.

**P2. Linear owns state.** Status, assignment, what has actually happened. Project
*FPL Advisor — v1*.

**P3. Read order from the plan, write state to Linear.** One direction each. Linear due dates are
set *from* the plan, never the reverse. Neither restates the other.

**P4. Never take a slice out of order.** To change the order or a date: propose it with reasoning,
stop, and wait. On agreement, hand Stephen a prompt to paste into Cowork (P9) — the plan is edited
in the vault and the derived file regenerates. You cannot edit it yourself.

**P5. `docs/build-plan.md` and `docs/criteria/` are derived.** Never edit them. If one looks wrong,
raise it as a Challenge (G3).

**P6. Re-read the plan at the start of each task.** It can change mid-session.

## B. This project's silent-failure list

**P7. G7 applies to five things here, and they do not all live in the same place.**

Four are in `CLAUDE.md`, under *Data rules* and *Architecture invariants* — row-level security,
`is_next` vs `is_current`, `data_checked` vs `finished`, and fixture count never coming from a
projection.

The fifth, **the spend cap, is not in `CLAUDE.md` at all.** It is in
`docs/criteria/NFR.criteria.md` under *Cost control*. It is a £50 prepaid balance in the Anthropic
console (STE-52), and `NFR.criteria.md` states that a ceiling inside the application is
**deliberately not built** — the safeguard stays external and simple. So there is nothing in this
repo to test, and writing a test for it would be inventing the very mechanism the requirements
rejected. Its verification step is "open the Anthropic console and read the balance".

## C. Derived files and their extractors

**P8. Both derived artefacts are checked by `.githooks/pre-commit`:** `extract-criteria.py --check`
for `docs/criteria/`, and `extract-build-plan.py --check` for `docs/build-plan.md`. A drift fails
the commit rather than passing quietly — this is the mechanism behind G18's fourth bullet. If
either check reports that the vault could not be reached, that is a fact to report, not a green
light.

## D. The Cowork handoff

**P9. The Cowork handoff is for plan changes only** (P4). Not for translation, not for reviews, not
for checking something against the vault. If you find yourself wanting a second opinion from the
vault, that is a sign something is missing from this repo — say so.
