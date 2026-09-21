# Working rules — FPL Advisor

**The general contract loads into every session automatically, through imports in
`~/.claude/CLAUDE.md`.** It holds the reader, the five reply types, verification, scope, the ask
gates, boundaries, reviews and documents, numbered `G0…`. It is authored in Stephen's vault at
`03 Resources/Context/Contract.md`, not somewhere you can open. This file holds only what is true
of *this* project, numbered `P1…`. Nothing is stated in both places: if a rule is not here, it is a
`G` rule. Numbers are stable; a retired number stays as a pointer. Why each rule reads as it does is
in `docs/working-rules-changelog.md`.

**The unit of work (G10) is a slice.** One slice, one session.

## A. Source of truth

**P1. `docs/build-plan.md` owns order and dates** — day, sequence, slice, and the order of work
within a day. It is derived from the Build Plan in Stephen's vault. Re-read it at the start of each
task; it can change mid-session.

**P2. Linear owns state** — status, assignment, what has actually happened. Project
*FPL Advisor — v1*.

**P3. Read order from the plan, write state to Linear.** One direction each; Linear due dates are
set *from* the plan. The plan's day checkboxes show that the sequence advanced, not that a ticket
changed status — they stay, because Linear cannot express order. **Where the two disagree about
state, Linear is right.**

**P4. The plan and the criteria are changed in the vault, never here.** `docs/build-plan.md` and
`docs/criteria/` are derived: never edit them, and if one looks wrong, raise a Challenge (G3). Never
take a slice out of order. To change order or a date, propose it with reasoning, stop and wait; on
agreement, hand Stephen a Cowork prompt (P9) and regenerate here afterwards.

**P5.** *Retired 2026-09-21 — folded into P4.*

**P6.** *Retired 2026-09-21 — folded into P1.*

## B. This project's silent-failure list

**P7. G7 applies to five things here.** Four are in `CLAUDE.md`, under *Data rules* and
*Architecture invariants*: row-level security, `is_next` vs `is_current`, `data_checked` vs
`finished`, and fixture count never coming from a projection. **`data_checked` vs `finished` is
dormant** — no consumer since STE-175 — so it must not be counted as verified; it re-enters the
class the moment anything shows a settled points figure.

The fifth, **the spend cap**, is a £50 prepaid balance in the Anthropic console (STE-52).
`docs/criteria/NFR.criteria.md` says an in-app ceiling is deliberately not built, so there is
nothing to test. Its check is "open the Anthropic console and read the balance".

## C. Derived files

**P8. `.githooks/pre-commit` checks both derived files** (`extract-criteria.py --check`,
`extract-build-plan.py --check`) and fails the commit on drift. "Vault could not be reached" is a
fact to report, not a green light.

## D. The Cowork handoff

**P9. The Cowork handoff is for editing the vault source of a derived file, and nothing else** —
the Build Plan for order and dates (P4), the PRD for a criterion's wording. The prompt edits the
vault only; regenerating and committing stay with the repo session, where P8 checks it. Not for
translation, reviews, or checking something against the vault — wanting a second opinion from the
vault means something is missing from this repo; say so.

## E. The slice review

**P10. Every slice ends with a cold review (G27) before its ticket is called done.** Run the
`slice-review` skill in a subagent, given paths and a commit range only. It posts three things to
the build ticket: what was built that the spec did not account for, what the spec asked for and is
missing, and what the spec left open that the build had to decide. Nothing from a review enters
`docs/manual-coverage.md` or `docs/coverage-gaps.md`. A finding that recurs across two slices is
*proposed* as a new `P` rule here, never added.

**P11.** *Retired 2026-09-21 — promoted to G27; project specifics folded into P10.*

**P12.** *Retired 2026-09-21 — moved into `slice-spec`.*

## F. What is yours to decide

**P13. G14's list, for this project.** Decide these and note them in one line:

- schema shape and migration mechanics
- how row-level security is implemented
- code structure, file layout, naming
- library choices where the stack is settled (ADR 0005, ADR 0006)
- how a test is written, formatting, types
- routine git inside a slice — branch, commit, PR

**Hard edges set elsewhere, not choices:** the `packages/engine` dependency, `lib` and `types`
boundary; the no-local-API-key rule; no scheduled jobs (all in `CLAUDE.md`); and derived files (P4).
A change to any of them is a G13 ask. Where the list is silent, G14 still governs.

## G. Failing and partial criteria

**P14. A criterion that is not satisfied gets told to Stephen, and then gets a home.** Never one
without the other. Say so in the reply where it was found; then fix it there, or put it on a ticket
whose scope covers it. **The citation must resolve both ways** — if `coverage-gaps.md` names a
ticket as owner, the ticket says so too. The default is to fix it in the slice that broke it; the
ticket route costs a sentence saying which slice and why.

## H. Tickets

**P15.** *Retired 2026-09-21 — moved into `slice-tickets`.*

## I. Tests that name a criterion

**P16. G7's check rule, applied to criteria.** `pnpm coverage:criteria` counts a criterion covered
when its identifier appears in a test name (ADR 0010); it cannot tell whether the test reached the
circumstance. So before naming a criterion in a test: does it cause the trigger, not assume it? Is
any fixture figure hand-typed where the code derives it? Would it still pass with the production
line deleted? **Where the trigger genuinely cannot be reached**, the criterion goes in
`docs/coverage-gaps.md` with what would close it, and its identifier is not named in a test.

## J. What a spec has to name

**P17.** *Retired 2026-09-21 — moved into `slice-spec`.*

**P18.** *Retired 2026-09-21 — moved into `slice-spec`.*

**P19.** *Retired 2026-09-21 — moved into `slice-spec`.*
