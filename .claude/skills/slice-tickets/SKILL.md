---
name: slice-tickets
description: "Publish one slice's tickets to Linear from its spec in docs/specs/."
disable-model-invocation: true
---

# Slice tickets

**Publish the tickets for one slice, from that slice's spec, into Linear, project
*FPL Advisor — v1*.**

The slice already exists. `docs/build-plan.md` fixed twelve of them and owns their order, dates and
ticket identity; the build tickets STE-51..STE-71 are already in Linear, one per slice, cited by
identifier in the build-order table. **This skill never slices, never schedules, and never creates a
top-level ticket for a slice.** It publishes the work *inside* one slice, attached to the ticket the
plan already names.

Adapted from `to-tickets` in `mattpocock/skills`, which slices greenfield work and invents its own
ticket set. That one stays source-only — see the skills bullet in `CLAUDE.md`.

## Before anything else

**Check the Linear MCP is reachable.** `list_projects` for *FPL Advisor — v1* is the cheapest probe.
If it is not there, **draft the tickets into the session and stop** — say plainly that they were not
published and that Linear needs connecting. Never write them somewhere else instead.

Then confirm the two preconditions:

1. **The slice's spec exists** in `docs/specs/`. If it does not, run `slice-spec` first — this skill
   publishes a spec, it does not write one.
2. **The slice's parent build ticket exists** and is named in `docs/build-plan.md`'s build-order
   table. Read the row: build ticket, test ticket, and the day from the schedule table.

## The guard

**Every ticket this skill creates is a sub-issue of the slice's build ticket.** Set `parentId` to
that ticket. A second top-level ticket for a slice desynchronises Linear from the plan, and the plan
is the file that owns ticket identity (P1).

**Do not close or modify the parent.** Not its title, not its body, not its status.

**Test tickets follow the plan's Tests column, not a formula.** **Read the whole cell**, and match
it against these three values — never scan it for a `STE-` identifier, because two of the three
contain one and they mean opposite things.

| The Tests cell reads | What it means | What to do |
| --- | --- | --- |
| **A ticket of its own** — `STE-58`, `STE-57`, `STE-61`, `STE-63` | That ticket is where automated verification lives. | Attach one sub-issue **to that ticket** per verification mechanism the spec names — unit, integration, Playwright. Never a peer beside it. |
| **`in STE-<n>`** — slice 10 reads `in STE-68` | The identifier is the slice's **build** ticket. The plan has ruled that the tests live inside it. | Handle exactly as `—` below. |
| **`—`** | The slice carries its checklist inside the build ticket. | Add the checklist as a sub-issue of the build ticket. Create no test ticket. |

The middle row is the trap. `in STE-68` names the same ticket the Build column names, so a cell
read as an identifier turns the build ticket into a test ticket and hangs the slice's own tests off
the wrong parent. **Compare the identifier against the Build column: if they match, it is the build
ticket.**

A cell in none of these three shapes means the plan has changed. Stop and say so (G3) rather than
picking the closest row.

## Steps

### 1. Draft the tickets

Work from the spec's *Modules*, *Interfaces* and *Verification* sections. Each ticket is a **tracer
bullet**: a narrow but complete path through every layer it touches, verifiable on its own, sized to
fit one fresh context window.

Look for prefactoring first — make the change easy, then make the easy change — and sequence it
ahead of everything it makes easier.

**Blocking edges are declared before anything is published.** Give each ticket the tickets that must
complete before it can start, including edges reaching outside the slice (an earlier slice, an open
question in `docs/specs/architecture.md` §8, a decision ticket). A ticket with no blockers says so.

### 2. Confirm the list

Publishing to Linear is outward-facing and awkward to undo, so show the list first and wait. For
each ticket: **title**, **blocked by**, and **what it delivers** in one line of plain English.

Ask about consequences, not construction (G15): does this cover the slice, and is anything here
really a separate day's work? Granularity of the *slice* is not on the table — the plan owns it.

### 3. Fill the fields

**Compulsory. If the answer is not already given, ask — with a suggested answer attached.**

| Field | Suggested answer to offer |
| --- | --- |
| **Title** | Drawn from the spec section it implements. |
| **Issue Type** | From the six below. |
| **Priority** | The parent build ticket's priority. |
| **Milestone** | The parent build ticket's milestone. |

**Fetch milestones live with `list_milestones` every run. Never hardcode one.** No issue is created
unlinked — an issue with no milestone is not done, however complete it looks.

**Issue Type options:** `Task`, `Bug - Coding`, `Create Test - Coding`, `Decision`,
`Feature - Coding`, `Manual Test`. **Verify this list against `list_issue_labels` before relying on
it**, and if the workspace has drifted from it, say so rather than picking the nearest match.

**Responsible is derived, never asked.** It is a label group, and the derivation is mechanical:

- Issue Type ending **`- Coding`** → label `Coding Agent`, and **leave the native Assignee empty**.
- Anything else → label `Stephen`, and **set the native Assignee to Stephen**.

State the derivation back when confirming, so a wrong Issue Type shows up as a wrong owner.

**Due date comes from the plan, never the reverse** (P3). Read the slice's day from the schedule
table in `docs/build-plan.md` and set it.

### 4. Write the bodies

<issue-template>

## What to build

The end-to-end behaviour this ticket makes work, in the terms the domain glossary uses. Not a
layer-by-layer implementation list.

## Spec

The section of the slice's spec in `docs/specs/` that governs this ticket, by heading.

## Acceptance criteria

The identifiers this ticket satisfies, as `F<n>-AC-<nn>`, resolving to `docs/criteria/`. Never
restated — the words are derived and regenerate.

## Blocked by

Each blocking ticket by identifier, or "None (can start immediately)".

</issue-template>

**No file paths and no code snippets in a ticket body.** Both go stale within a slice, and the spec
is the thing that is kept current — the ticket cites its section instead. The one exception is a
snippet that encodes a decision more precisely than prose can (a schema, a state machine, a type
shape); inline the decision-rich part only, and say where it came from.

**Word budget.** What to build 120 · Spec 25 · Acceptance criteria 40 · Blocked by 40.
**225 words per ticket.**

### 5. Publish in dependency order

Blockers first, so every blocking edge can be set against a real identifier as it goes. Work the
frontier: any ticket whose blockers are all published. For a linear chain that is top to bottom.

Set the edges with Linear's native `blockedBy` / `blocks` relations, not prose in the body.

### 6. Run the two automatic checks

Both are **surfaced, never gates**. Report what each found and carry on.

- **Blocking relationships.** Scan the published set and the wider project for edges the spec did
  not name, set the ones that are real, and report every relation set.
- **Duplicates and sub-issue candidacy.** Search the project for a ticket that already covers this
  work, and for a ticket this one would sit better underneath. Report both. Do not silently merge,
  re-parent or skip.

### 7. Verify, then report

**Read every created issue back with `get_issue` and confirm each field against what was intended:**
title, Issue Type, Responsible, Assignee, Priority, Milestone, due date, parent, blocking edges,
criteria identifiers.

**A missing milestone means not done.** Fix it and read it back again.

Report as a *Task complete* (G4): the tickets created with their identifiers, the parent they hang
from, the relations set, and anything the duplicate or sub-issue check surfaced.
