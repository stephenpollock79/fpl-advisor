---
name: slice-spec
description: "Write the just-in-time spec for one build-plan slice into docs/specs/."
disable-model-invocation: true
---

# Slice spec

**One spec, one slice, written the session before that slice is built.**

Discovery is done. The PRD did it, and `docs/criteria/` holds the acceptance criteria it produced.
`docs/build-plan.md` fixed twelve slices and owns their order, dates and ticket identity.
`docs/specs/architecture.md` fixed the system shape. **This skill adds no requirements, creates no
slices and moves no dates.** It writes down how one slice meets criteria that already exist.

Adapted from `to-spec` in `mattpocock/skills`, which assumes a greenfield and publishes to a tracker.
That one stays source-only — see the skills bullet in `CLAUDE.md`.

## Inputs, and only these

1. **The slice's row in `docs/build-plan.md`** — number, name, build ticket, test ticket, day.
2. **The slice's criteria file(s) in `docs/criteria/`.** F3 and F4 also read `ENGINE.criteria.md`.
   `NFR.criteria.md` applies to every slice.
3. **`docs/specs/architecture.md`** — 1–7 for shape and contracts, 8 for what is still open, 9 for
   migrations, 12 for what is deliberately not built.
4. **The previous slice's review comment in Linear** (P12), on that slice's build ticket. Its third
   section — what the last spec left open that the build had to decide — is an input to this one.
   If there is no previous slice, or Linear is unreachable, say so in one line and carry on. Never
   infer what the review would have said.

Read the code the slice actually touches. Do not go looking for the PRD: the criteria files are its
words, verbatim.

## Steps

### 1. Fix the slice

Re-read `docs/build-plan.md` — it can change mid-session (P6). Take the **next slice in order** (P4).
Name it back in one line before writing anything: number, name, build ticket, test ticket, day.

The twelve slices and their ticket identity are fixed. If the work looks like it wants a thirteenth,
or a different order, that is a Challenge (G3): say so, stop, and wait.

**Then read the previous slice's review** (input 4). Name, in one line each, the gaps from its third
section that this spec closes — and any it does not, with why. A gap that recurs here after showing
up in two reviews is a rule `slice-spec` is missing: raise it as a proposed `P` rule (P11) rather
than absorbing it silently into this one spec and losing it again.

### 2. Count the criteria in scope

List every identifier the slice's criteria file declares — the first column of the criteria table,
`F<n>-AC-<nn>`, `F<n>-UP-<nn>`, `F6-RS-<nn>`. Split them into **in scope for this slice** and **left
for a later slice**, and say which later slice.

Citing an identifier in a spec is free: `scripts/criteria-coverage.mjs` reads test files and the
table rows of `docs/manual-coverage.md`, and never reads `docs/specs/`. A spec cannot inflate the
coverage figure.

**If the file declares zero identifiers, take the zero-criteria branch below before going on.**

Where a criterion is true but too coarse to build from, the interaction detail belongs in this
spec's *Interfaces* section, citing the criterion. **Do not propose new PRD criteria to carry it** —
criteria are capped at five per feature and stay at PRD level, and `docs/criteria/` is derived and
regenerates over any edit (P5). A slice that genuinely cannot proceed without a new criterion is a
Challenge (G3), not a spec section.

### 3. Decide the seams, and declare the blocking edges

**Seams.** Prefer an existing seam to a new one; take the highest seam available; the fewer seams
across the codebase, the better, and one is the ideal. Decide this yourself and state it in a line
of plain English each — where the slice is tested from, and what that seam sees. A seam is an
implementation call (G14), so present the consequence, never the choice (G15).

**With one exception, and it is a list rather than a judgement.** A seam that touches any of the
following is hard to undo, and hard to undo is an ask gate (G13): stop, and put the consequence to
Stephen before writing the spec.

The first four are `docs/specs/architecture.md` §1's boundary table — the four things the system
shape exists to stop:

- **The client's single data path**, `apps/client/src/api.ts`. Moving off client rendering is a
  rewrite of every data path rather than a configuration change (ADR 0005, *Consequences*); this
  file is the one place that rewrite would have to happen, and a seam that reaches around it
  removes the mitigation.
- **The engine's zero-dependency, no-runtime-types rule** (ADR 0006). Adding a dependency, widening
  its `lib`, or giving it `types` are the only three ways through the boundary, and each one
  converts a mechanism back into a convention. `tests/engine-package-boundary.test.ts` asserts it.
- **The row-level-security boundary** — every table with user data carrying a policy in its creating
  migration, and the server reading user data as the signed-in user rather than with the service
  key (ADR 0007).
- **The server/client build split**, which is what stops a key reaching the browser.

And two by their general form:

- **Storage shape and units** — anything a migration would be needed to reverse. Money is an integer
  in tenths of £1m throughout, and no float ever holds money.
- **Anything else whose undo is a migration, or a rewrite of every call site.**

Everything not on this list, decide and state. **The gate is this list, not a feeling** — a seam
either touches one of these or it does not.

**Blocking edges, declared before anything is published.** Name what must be settled before the
slice can start. Three kinds, and they are not the same:

- **An open question in `docs/specs/architecture.md` §8** with a ticket and a date on it. If the
  date is before this slice's day, it is a blocker and the spec says so.
- **A slice earlier in the build order** that has not landed. Say which.
- **A decision only Stephen can make** (G13). Raise it now, in this session, not inside the build.

A slice with no blocking edges says so explicitly.

### 4. Zero-criteria branch

`ENGINE.criteria.md` and `NFR.criteria.md` declare **zero identifiers**. That is a fact about the
PRD, recorded in ADR 0010 and in `docs/specs/architecture.md` §8.3 — not a gap to fill here.

When the slice's criteria file declares none:

1. **Invent no identifiers.** `scripts/criteria-coverage.mjs` counts only the shape
   `F<n>-AC|UP|RS-<nn>`, and exits non-zero on one of those that no criteria file declares. So a
   made-up identifier either breaks the report or — like `ENGINE-AC-01`, which does not match the
   shape — is invisible to it. Neither creates coverage; the second is the more dangerous.
2. **Look for a recorded standard** — a ruling in `docs/specs/architecture.md` §8.3, an ADR, or the
   build ticket. For the engine, the Build Plan names the two candidates: add criteria to PRD 3.2
   and regenerate, or record that the worked example plus the unit tests are the standard.
3. **If no standard is recorded, stop and ask** (G1). What the slice is verified against is a
   functionality decision, and the answer changes what gets built. Deliver everything that does not
   depend on it first.
4. **Once ruled, the spec names the standard in place of the criteria list**, and its *Verification*
   section states in one line that `pnpm coverage:criteria` will report nothing for this slice, so
   the silence is read as absence of identifiers rather than absence of tests.

### 5. Write the spec

`docs/specs/slice-<n>-<slug>.md`, e.g. `docs/specs/slice-3-f1-squad-state.md`. One file per slice.

**Five headings, in this order, and no others.** The three body sections come from `to-spec`; the
two tail sections are what this project needs on top. Problem statements, user stories, solution
narrative and out-of-scope prose are all deliberately gone — the PRD holds them and the criteria
files quote it.

<spec-template>

# Slice <n> — <name>

One line of front matter, not a section: build ticket, test ticket, day, and the criteria file(s)
this slice reads.

## Seams

What this slice touches at its boundaries, where it is tested from, and **what blocks it**. Blocking
edges named here before anything is published.

## Modules

The files and packages created or changed. A list, not prose.

## Interfaces

The actual contracts: route request and response shapes, types, component props, database columns
and their migration. Interaction detail that a criterion implies but does not spell out lives here,
citing the criterion.

**Every behaviour here names its value** (P17): the threshold, the window, the field it reads,
which list it counts, which of two figures it shows. Read each sentence back and ask whether two
competent people would build the same thing from it — where they would not, the missing word is a
value. Where one genuinely cannot be fixed yet, say so and name who decides it in the build.

**And two more passes over the same section, because P17 alone does not catch either.**

**What this change breaks elsewhere** (P18): where the slice changes a value, removes a feature or
moves a control, say what else was reading that thing and what happens to it now. A change can be
entirely correct in itself and still leave a criterion unmet, a label orphaned, or a decision
standing against figures that have moved.

**What happens when something is absent, broken or expired** (P19): for each dependency the
behaviour leans on and each input it takes, say the posture when it is unavailable, missing,
malformed or out of date — and, where the manager is looking at a screen, what he sees and what he
can do next. **Fail closed is the default nobody chose**, and it is right for a send nobody is
waiting on and wrong for a code he is holding in his hand.

All three are the same failure wearing different clothes: a question the spec did not ask, answered
silently and correctly-looking by whoever wrote the line.

## Criteria in scope

Identifiers only, grouped, **never restated**. The identifier resolves to `docs/criteria/`; copying
the words creates a second copy that the next regeneration silently makes wrong. Name the criteria
in the same file left for a later slice, and which slice.

## Verification

Two lists, split by mechanism. See the rules below.

</spec-template>

**Word budget.** Seams 300 · Modules 125 · Interfaces 450 · Criteria in scope 125 ·
Verification 400. **1,400 words total.** Over budget means cut, never append.

**Repriced 2026-09-16 (STE-172) — do not tidy it back.** The first budget was written
before `P16` and `P17` existed, and both add words deliberately: `P17` makes *Interfaces*
name every value rather than describe a behaviour, and `P16` makes each verification entry
say what *causes* the criterion's trigger, so every line in that section is longer by
design. Measured across the seven specs written under the old numbers, **Verification
overran on five of seven and twice by roughly double** (213 · 250 · 314 · 317 · 381 · 481 ·
501 against 250), while **Modules never once reached 125** (longest: 120) and *Criteria in
scope* never reached 150. So the two sections that were over-funded pay for the two rules
that were never priced. A budget that a rule guarantees you will exceed is not a budget; it
is a rule nobody can follow, and the first thing to go is whichever one is cheaper to
ignore.

### 6. The verification section

Every criterion in scope lands in exactly one of two lists.

**Automated** — anything Vitest or Playwright can assert. Give the test name as it will be written,
naming its criteria per ADR 0010:

```ts
it('F1-AC-01, F1-AC-02: fifteen players, eleven starters, bench in fixed order', …)
```

One test may name several identifiers and several tests may name one. Coverage means *something
asserts this*.

**And every entry says what causes the criterion's trigger, not only what it asserts** (P16). A
criterion has two halves — when it applies, and what must then be true. A test that sets up the
second by hand and never causes the first reports covered while proving nothing about the rule, and
everyone stops looking. So the test name carries the circumstance as well as the claim: a refresh
criterion runs a refresh, a card criterion renders a card, a first-open criterion opens for the
first time.

```ts
it('F6-AC-02: a selected call still reads selected · locked after a refresh runs', …)
```

**Where the trigger cannot be reached, the criterion goes in neither list.** It goes to
`docs/coverage-gaps.md` with what would close it and a live owner, and the spec says so rather than
naming the identifier in a test that reaches only the other half. `scripts/criteria-coverage.mjs`
counts an identifier appearing anywhere in a test file — including inside a comment saying it is
*not* asserted, which is how `F6-AC-20` reads as covered today. An honest gap costs a line in a
file; a false green costs whatever it was hiding.

**Manual** — anything visual or tactile, and anything graded on model output. Write the checklist:
what to do, why it matters, plain English (G9). Never fake it with a class-name assertion.

Then the trap. **`docs/manual-coverage.md` records only criteria that have already been verified**,
with the date and where the record is. This skill writes **nothing** into that register: an entry
made in advance turns the coverage figure into a claim about the future. The spec says which
criteria are manual; the register entry is made after the check is run, by whoever ran it. A test
that exists but proves less than its criterion asks belongs in `docs/coverage-gaps.md`, which is
deliberately kept outside the coverage script's view.

Close the section by naming the five silent-failure items that touch this slice, if any (P7). Those
are the ones whose verification step Stephen runs himself. The spend cap has no test in this repo
by design — its check is reading the balance in the Anthropic console.

### 7. Finish

Report as a *Task complete* (G4): the spec's path, the slice it covers, the blocking edges declared,
and the criteria split as a count — in scope, automated, manual, deferred.

**Publish no tickets.** That is `slice-tickets`, and it is a separate unit of work (G10).
