# Working rules — FPL Advisor

**The general contract loads into every session automatically, through imports in
`~/.claude/CLAUDE.md`.** It holds the reader, the five reply types, verification, scope, the ask
gates and the repo boundary, numbered `G0…`. It is authored outside this repo, at
`03 Resources/Context/Contract.md` in Stephen's vault — that is where a human edits it, not
somewhere you can open. This file holds only what is true of *this* project, numbered `P1…`.
Nothing is stated in both places: if you are looking for a rule and it is not here, it is a
`G` rule.

Agreed 2026-09-03/04, split 2026-09-04 (STE-83); contract moved to the vault 2026-09-08. It is expected to change after the first few
slices — say so if a rule is getting in the way rather than quietly dropping it.

**The unit of work (G10) is a slice.** One slice, one session.

## A. Source of truth

**P1. `docs/build-plan.md` owns order and dates.** Day, sequence, slice. It is a derived file
generated from the Build Plan in Stephen's vault.

**P2. Linear owns state.** Status, assignment, what has actually happened. Project
*FPL Advisor — v1*.

**P3. Read order from the plan, write state to Linear.** One direction each. Linear due dates are
set *from* the plan, never the reverse. Neither restates the other.

**The plan owns order, including the order of work within a day**, and the day sections' checkboxes
are how that order is displayed. Ticking one records that the plan's sequence advanced, not that a
ticket changed status: **Linear remains the only authority on state, and where the two disagree
Linear is right.**

*Added 2026-09-10.* Read without this, the sentence above condemns those checkboxes as the plan
restating state — which is how they sat unticked through a day that completed in full, and how a
later session talks itself into deleting them. They earn their place because Linear cannot express
what the plan can: a ticket's status says nothing about whether it came first or third that day.

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

**P9. The Cowork handoff is for editing the vault source of a derived file, and nothing else** —
the Build Plan for order and dates (P4), the PRD for a criterion's wording. Either way the edit
happens in the vault and the derived file is regenerated here, where P8 checks it (P5). The prompt
edits the vault only; regenerating and committing stay with the repo session. Not for translation,
not for reviews, not for checking something against the vault. If you find yourself wanting a
second opinion from the vault, that is a sign something is missing from this repo — say so.

*Widened 2026-09-11, from plan changes only.* A PRD edit reaches the build the same way a plan
change does, and the narrower wording left the criteria's one route to change unnamed (STE-116,
STE-77).

## E. The slice review

*Section E added 2026-09-08.*

**P10. Every slice ends with a cold review, before its ticket is called done.** Run the
`slice-review` skill. It reads the slice's spec, its criteria and the diff, and posts three things
to the build ticket: what was built that the spec did not account for, what the spec asked for and
is missing, and what the spec left open that the build had to decide.

**The review runs in a subagent, and that subagent is given identifiers only** — paths and a commit
range. The session that built the slice cannot review it: it has already decided that every one of
those files was necessary, and will decide it again. Handing that subagent a summary, an explanation
or a reason a file exists puts the context back, and what comes out is not a review but the same
opinion in a second voice.

**P11. The review reports. It does not fix, revert, or record coverage.** Acting on a finding is a
separate unit of work (G10); removing something the review names is a scope decision (G13). Nothing
from a review enters `docs/manual-coverage.md` or `docs/coverage-gaps.md` — both state what may
enter them and neither takes entries from a review. A finding that recurs across two slices is
*proposed* as a new `P` rule here, never added.

**P12. The next slice's spec reads the last slice's review.** `slice-spec` opens the previous
slice's review comment before it writes, and the review's third section is an input to it. This is
the whole mechanism by which a later spec is better than an earlier one: writing the specs just in
time creates the opportunity and nothing more. If Linear is unreachable, say so and write the spec
without it — never infer what the review would have said.

## F. What is yours to decide

*Section F added 2026-09-08, on `G14` being generalised out of the global contract.*

**P13. G14's list, for this project.** Decide these and note them in one line. Do not ask:

- schema shape and migration mechanics
- how row-level security is implemented
- code structure, file layout, naming
- library choices where the stack is settled (ADR 0005, ADR 0006)
- how a test is written, formatting, types
- routine git inside a slice — branch, commit, PR

**The list has hard edges, and they are set elsewhere.** Four things look like items on it and
are not choices at all: the `packages/engine` dependency, `lib` and `types` boundary; the
no-local-API-key rule; no scheduled jobs; and derived files (P5). The first three are in
`CLAUDE.md` under *Architecture invariants* and *Conventions*. P13 does not reopen them, and a
change to any of them is a `G13` ask.

**Where the list is silent, `G14` still governs** — decide, note it in one line. This list is the
settled cases, not the boundary of your discretion.

## G. Failing and partial criteria

*Section G added 2026-09-09, after slice 2 recorded two gaps and one of them named a
ticket that said nothing about it.*

**P14. A criterion that is not satisfied gets told to Stephen, and then gets a home.**
Never one without the other. When work leaves a criterion failing, partial, or true only
by convention:

- **Say so in the session**, in the reply where it was found. Not in a file he has to go
  looking in, and not only in a commit message.
- **Then either fix it there and then, or put it on a ticket** — an existing one whose
  scope already covers it, or a new one. A gap recorded in `docs/coverage-gaps.md` with no
  ticket behind it is a note, not a plan.

**The citation must resolve both ways.** If the gaps file names a ticket as the owner, that
ticket has to say so too. Slice 2 wrote "slice 10 owns this" into `coverage-gaps.md` while
STE-68 carried no mention of it — which would have evaporated the moment slice 10 opened its
own ticket and found nothing there. Same failure as a repo-side citation pointing at an ADR
nobody wrote: it looks checkable, and is not.

**This is not a licence to defer.** The default is to fix it in the slice that broke it.
The ticket route is for work that genuinely belongs to a later slice, and it costs a
sentence saying which slice and why.

## H. Tickets

*Section H added 2026-09-11, after 31 tickets were found in Linear's "No milestone" lane.
`slice-tickets` required a milestone; nothing covered tickets logged in passing.*

**P15. Every ticket has a milestone from the moment it exists.** Whoever creates a ticket —
a slice ticket, or one logged under G11 or G20 — sets its milestone in the same call:

- **the milestone of the work it was found in**, or
- ***Post MVP*, when Stephen has ruled it for after the MVP.**

Fetch milestones live with `list_milestones`; never hardcode an id. Where the right one is
unclear, use the milestone of the work in hand and say so in the reply.

**Moving an open ticket to a different milestone later is a scope change**, and is asked
first (Linear conventions, *Ask first*). Filing a finished ticket where its work happened is
bookkeeping, and is not.


## I. What a test that names a criterion has to do

*Section I added 2026-09-14, after three criteria were found green over behaviour that
did not work — two of them on the same evening, one of them green for four days.*

**P16. A test naming a criterion must exercise that criterion's own trigger, not just its
assertion.** `pnpm coverage:criteria` finds a criterion covered when its identifier appears
in a test name (ADR 0010). It cannot tell whether the test reached the circumstance the
criterion is about. That is this rule's job, and nothing else does it.

Every criterion has two halves: **when** it applies, and **what must then be true**. A test
that sets up the second half by hand and never causes the first proves the assertion and
nothing about the rule. It is worse than no test, because the report says covered and
everyone stops looking.

The three that prompted this, all found by Stephen on a phone rather than by the suite:

- **`F4-AC-01`, `-02`, `-03`** were ticked by engine tests proving the arithmetic of a
  no-change outcome. The criteria are about a **card** — advice every week, a
  non-interactive panel, a tally that excludes it. No card existed.
- **`F6-AC-02`** — *a selected call reads selected · locked* — was asserted on a fixed
  screen that already held the call. **It never ran a refresh**, and a refresh is the only
  circumstance the criterion is about. Meanwhile the accepted call was vanishing at every
  refresh. Green for four days.
- **`F6-RS-08`** — *most refreshes should cost nothing* — had quiet-week tests carrying a
  hand-written conviction and band. The fixture disagrees with them, so every one of those
  tests took the **spend** path and the reuse it was written for was never once executed.

**Three shapes to check before naming a criterion in a test:**

1. **Does the test cause the trigger, or assume it?** A refresh criterion runs a refresh. A
   card criterion renders a card. A first-open criterion opens for the first time.
2. **Is any figure in the fixture hand-written where the code derives it?** If the assertion
   depends on a number someone typed, the test decides its own result. Take the figure from
   a real run and feed it back — `tests/runs/routes.test.ts` does this now, and it is why
   the reuse path is exercised at all.
3. **Would the test still pass with the behaviour removed?** Delete the production line and
   run it. A test that survives that proves nothing.

**Where the trigger genuinely cannot be reached** — a swipe, a disconnect, a real deadline
passing — the criterion belongs in `docs/coverage-gaps.md` with what would close it, and the
identifier must **not** be named in a test that reaches only the other half. An honest gap
costs a line in a file. A false green costs whatever it was hiding.

## J. What a spec has to name

*Section J added 2026-09-15, after three consecutive cold reviews led with the same finding.*

**P17. A spec names the value, not just the behaviour.** Wherever a spec says what something
does, it states the number, the source or the set it does it with — the threshold, the window,
the field it reads, which list it counts, which of two figures it shows. Where a value genuinely
cannot be fixed in advance, the spec says so and names who decides it in the build.

**An unnamed value does not stop a build.** It gets chosen, silently and correctly-looking, by
whoever is writing that line — and the first person to see the choice is whoever opens the screen
afterwards. That is the whole failure: not a wrong decision, a decision nobody made.

The three that prompted this, one per slice, each from that slice's review:

- **Slice 6.** The captaincy tie-break uses a stronger signal. **Which data the signal comes
  from** was not named.
- **Slice 7.** Repeated opens are coalesced into one feed read. **For how long** was not named;
  the build picked two minutes. The swapped-transfer cost was the same shape, and the build filed
  every swapped pair at zero.
- **Slice 8.** Four of them. Whether a call row's points figure is **this gameweek or the
  three-gameweek horizon** the conviction is built from; whether the squad widget's figure is a
  **total or a change**; **which source** the editorial names for the squad; and whether the
  editorial counts **only the calls this run planned, or the carried ones too**.

Two of slice 8's four were wrong on the phone and one was a defect — the editorial said "3 calls
this week" over a screen showing six. None of them was caught by a test, because each was a
coherent answer to a question the spec had not asked.

**The test to apply while writing.** Read each sentence of *Interfaces* and ask whether two
competent people would build the same thing from it. Where they would not, the missing word is a
value, and it goes in.

**This makes specs longer, and the word budget is already tight.** That is the accepted cost: a
value named in a spec is a sentence Stephen can disagree with before it is built, and the same
value found in a review is a round trip after it is. If the budget and this rule genuinely
collide, say so rather than dropping either.

## K. What a spec has to say about going wrong

*Section K added 2026-09-16, on Stephen's ruling, from two proposals raised the same day.*

**P18. A spec names what its change breaks elsewhere.** Where a slice changes a value, removes a
feature or moves a control, the spec states what else depended on that thing and what happens to
it now.

**The failure is not a wrong decision — it is a consequence nobody traced.** `P17` catches a value
the spec failed to name; this catches a value the spec named correctly while missing what else was
reading it. Three instances across slices 8 and 9, none caught by a test, because every change was
correct in itself:

- **Slice 8.** Cutting the Chips section also cut the Landing screen's chip claim, leaving four
  where `F7-AC-16` says five. And the call stepper's position label did not survive the move into
  the status bar.
- **Slice 9.** An upload changes the bank and the free-transfer count — and nothing said what
  happens to decisions already taken against the old figures.

Slice 8's review separated these out itself and said they did not yet have three occurrences.
Slice 9 supplied the third.

**P19. A spec says what happens when something is absent, broken or expired.** For each dependency
a behaviour leans on and each input it takes, the spec states the posture when it is unavailable,
missing, malformed or out of date — and, where the manager is looking at a screen, what he sees and
what he can do next.

**An unstated failure posture does not stop a build either.** It gets chosen by whoever is writing
the line, and the choice is usually *fail closed*, because that is the safe-sounding default. That
is right for a send nobody is waiting on and wrong for a code the manager is holding in his hand.
**The two cases look identical while you are writing them and differ entirely for the person on the
phone.** Five instances across slices 9 and 10:

- **Slice 9.** If the regeneration after a correction fails, the uploaded squad still stands.
- **Slice 10.** Four, and all four were decided silently: a dependency **down** — if the attempt
  counter cannot be read, verify refuses the code; an input **missing** — when the source-address
  header is absent, every such request shares one bucket; an input **malformed** — a submission that
  is not a well-formed address is answered without consulting the limits; a thing **run out** — an
  expired confirmation returns the link screen to the ID field with its own message.

**Deliberately two rules rather than one.** `P18` is *what this change breaks elsewhere*; `P19` is
*what this behaviour does when its own inputs fail*. They read alike and catch different misses,
and folding them together would lose one of the two every time.
