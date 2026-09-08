# ADR 0010 — Criterion identifiers in test names

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** STE-24, STE-33, STE-58, P8 (working rules)
- **Mechanism:** `scripts/criteria-coverage.mjs`, `docs/manual-coverage.md`

## Context

There are **236 acceptance criteria** across the ten Must slices, and until now there was no way to
answer *"which are still unverified?"* except by opening every ticket and reading its body.

That is precisely the question STE-33 asks on 15 September when calling the MVP, and none of the
three places state answers it. Linear holds status at *slice* granularity — a slice is done or it
is not, which says nothing about its criteria. `docs/criteria/` is derived and regenerated from the
PRD, so a tick written into it is erased by the next regeneration. The coverage column in the design
material was drawn but never built.

**This has to be settled before the first test is written, not after.** The first test in the repo
is STE-58, today. A naming convention adopted halfway through a suite covers half a suite.

## Decision

**Every automated test names the criteria it covers, in its own title.**

```ts
it('F7-AC-11: every table carrying user data has an RLS policy in its creating migration', …)
it('F1-AC-01, F1-AC-02: fifteen players, eleven starters, bench in fixed order', …)
```

One test may name several identifiers, and several tests may name one — coverage here means
*something asserts this*, not *exactly one thing asserts this*.

`scripts/criteria-coverage.mjs` reads the full set of identifiers out of the criteria files, reads
back what the tests and `docs/manual-coverage.md` claim, and prints the difference. Run it with:

```bash
pnpm coverage:criteria
```

Same pattern as `extract-criteria.py --check` (P8), pointed at a different question.

**Two things it deliberately does not do.**

It **does not gate the commit.** On the day it was written it reported 236 of 236 uncovered, which
is a true fact about a build that has not started, not a commit to reject. Whether it becomes a
pre-commit check is a decision for after the MVP, when the number means something.

It **does not count what it cannot see.** Human-checklist and eval criteria — anything visual or
tactile, anything graded on model output — are recorded by hand in `docs/manual-coverage.md`. That
register holds criteria that **have been verified**, with a date and where the record is. Not a plan
to verify them: an entry made in advance would turn the coverage figure into a claim about the
future, which is the one thing a coverage figure must never be.

It **does** fail on an identifier named in a test that no criteria file declares. A typo in a test
name would otherwise inflate the covered count and quietly hide the criterion it was meant to cover.

## Consequences

- The MVP-cut question becomes a command. STE-33 opens with a list rather than an audit.
- **A regeneration of `docs/criteria/` can now break the coverage report, and that is the point.** If
  the PRD renumbers or removes a criterion, the report says which test names no longer resolve —
  the same drift-detection idea as P8, one layer up.
- Test names get longer. Accepted: the identifier is a citation, and a test that cannot name what it
  is testing was probably not testing a requirement.
- **`ENGINE.criteria.md` and `NFR.criteria.md` carry zero identifiers**, so nothing in the engine or
  the non-functional requirements is trackable by this mechanism. That is a fact about the PRD, not
  a gap in this decision — and for the engine it is already flagged in the Build Plan as needing
  resolution before Thursday's slice 4.
