---
name: slice-review
description: "Review one finished slice from cold against its spec and criteria, and post the findings to Linear."
disable-model-invocation: true
---

# Slice review

**The last step of every slice (P10): a reader who did not build it says what was built that nobody asked
for, what was asked for and is missing, and what the spec failed to say.**

Three questions, one pass, in plain English (G9). **The third is the point.** `docs/build-plan.md`
says the specs are written just in time so later ones can absorb what the earlier builds taught, and
`slice-spec` opens this review before it writes (P12). **That pairing is the mechanism** — without
both halves the plan's line describes something that does not happen.

## Why this runs in a subagent

**The session that built the slice cannot review it.** It spent the session deciding each of those
files was necessary and will decide it again, with better arguments the second time. The reviewer
has to open the diff with no memory of why any of it is there.

So the review runs in a subagent, and **what that subagent is told is fixed by this skill, below**.
A summary of the build, an explanation of a decision, a reason a file exists — each one puts back
the context the split is there to remove. **Identifiers only: paths and a commit range.** The
subagent reads the files and runs the diff itself.

If a finding is wrong, let it be wrong in the comment where Stephen can see it and say so. Do not
pre-empt it, soften it, or answer it on the way past.

## Inputs, and only these

1. **The slice's row in `docs/build-plan.md`** — number, name, build ticket, day.
2. **The slice's spec** in `docs/specs/`. Its *Modules*, *Interfaces* and *Criteria in scope*
   sections are the contract the diff is read against.
3. **The slice's criteria file(s)** in `docs/criteria/`.
4. **The diff** — `main...HEAD` on the slice's branch. If the slice is already merged, the merge
   commit's range. Name the range you used in the comment; a review of the wrong range is worse
   than no review, and only the range makes that visible.

## Steps

### 1. Fix the slice and the range

Re-read `docs/build-plan.md` (P6). Name the slice back in one line: number, name, build ticket,
day. Resolve the diff range and check it is not empty. **An empty range means the review has
nothing to look at — say so and stop.** Do not review the working tree instead.

### 2. Run the review in a subagent

Launch one subagent with the prompt below. Substitute only the four bracketed values. **Add
nothing.**

<review-prompt>

You are reviewing one finished slice of a build. You did not build it and you have no stake in it.
Do not assume anything in the diff is justified.

Read, in this order:

1. `[spec path]`
2. `[criteria path(s)]`
3. `git diff [range]`

Where the diff touches something they govern, also read `docs/specs/architecture.md`, the relevant
file in `docs/adr/`, and the *Architecture invariants* and *Data rules* sections of `CLAUDE.md`.

Answer three questions. Plain English, for a product manager who does not read code — name the
behaviour, not the file, wherever a behaviour exists. **400 words, all three sections together.**

**1. Beyond the spec.** What is in the diff that the spec's *Modules* and *Interfaces* sections do
not account for? For each one, check whether an ADR, an architecture invariant, or a stated repo
convention required it. **If one did, it is not a finding — drop it.** If none did, it is a finding:
say in one sentence what it does, phrased as something Stephen could have asked for or not asked
for.

**2. Missing.** Which identifiers in the spec's *Criteria in scope* section have nothing in the diff
and no test naming them? List the identifiers. **Write nothing into `docs/manual-coverage.md` or
`docs/coverage-gaps.md`** — both have rules about what may enter them and neither takes entries from
a review.

**3. What the spec should have said.** What did the build have to decide because the spec left it
open? Not what was built wrongly — what was underspecified. One line each, written as the sentence
the spec should have contained.

If a section has nothing, write "Nothing." Do not pad and do not soften.

Change no files, publish nothing, and return the three sections as your reply.

</review-prompt>

### 3. Post it to Linear

**Check the Linear MCP is reachable first** — `list_projects` for *FPL Advisor — v1* is the cheapest
probe. If it is not there, put the review in the session, say plainly that it was not posted, and
stop. Never write it somewhere else instead.

One comment on the slice's **build ticket** — the identifier in the build-order table's Build
column. Not a new issue, not a sub-issue, and nothing about the ticket's status, title or body
changes here (P2 still owns state; this is an observation attached to it).

<comment-template>

## Slice review — slice `<n>` `<name>`

From cold, `<date>`. Spec: `docs/specs/<file>`. Criteria: `<file(s)>`. Diff: `<range>`.

### Beyond the spec

### Missing

### What the spec should have said

</comment-template>

**Post the subagent's three sections as they came back.** Editing them here is the parent session
reviewing its own work through the back door.

### 4. The trap: this is surfaced, never a gate

Nothing in the review blocks the slice, and **the review fixes nothing** (P11). Removing something the
first section names is a scope decision and Stephen's to make (G13); it is also a separate unit of
work (G10). Reverting it inside this session — or in the same session that built it — is exactly the
failure this skill exists to catch, arriving one step later.

The second section is the same: a missing criterion is reported, not quietly implemented.

### 5. When the same gap shows up twice

A recurring entry in the third section is no longer an observation about one spec — it is a rule
`slice-spec` is missing. **Say so and propose the `P` rule; do not add it** (P11). `docs/working-rules.md`
expects to change over the first few slices, and changing it is Stephen's call.

### 6. Finish

Report as a *Task complete* (G4): the slice, the range reviewed, the Linear ticket the comment
landed on, and a count for each of the three sections. **Do not restate the findings in the report**
— they are in Linear, and a second copy is one that drifts.

## What to expect on the first two slices

The reviewer has no baseline for what this repo normally needs, so early first sections will name
scaffolding. The ADR-and-invariant check in the prompt removes most of it and the rest settles by
slice three. **Report it as it comes back anyway.** Filtering it to look cleaner destroys the only
calibration Stephen gets on whether the reviewer can be trusted for the other eleven.
