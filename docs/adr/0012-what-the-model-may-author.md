# ADR 0012 — What the model may author, and what it must always be given

- **Status:** Accepted, 2026-09-16
- **Deciders:** Stephen
- **Related:** ADR 0008 (the reasoning interface), ADR 0009 (model routing), STE-148, and the eight faults below
- **Source:** One night's live use, 15–16 September 2026. No vault page; the evidence is the tickets.

## Context

`CLAUDE.md` already ruled that **code computes every figure shown**. That held, and it was not
enough. Across one evening of real use, eight separate faults reached the screen, each patched on
its own, all of them the same thing wearing different clothes:

| What shipped | Ticket |
| --- | --- |
| A call count written into frozen prose, while every figure on screen is re-derived on every read | STE-142 |
| A suppressed call labelled *the holder is better*, on a call that could not be executed at all | STE-143 |
| A forced call's reasoning arguing the comparison ran the other way, above a row proving it | STE-143 |
| The editorial filling five sentences where the criterion asks for five lines | STE-145 |
| **An invented injury**, about a fit player it recommended for the captaincy two clauses later | STE-146 |
| Calls listed with no way to say which was a transfer and which an armband | STE-149 |
| The stand-in paragraph writing the very count the prompt had been forbidden | STE-148 |
| The false comparison returning, because its fix was keyed to a flag that was then corrected | STE-150 |

**None was a coding mistake.** In every case the model was handed something it could not explain
from what it had, and did the only thing available: it filled the gap. A call worth +0.00 on a
*thin* band with no reason attached is not a hard prompt — it is an invitation.

**The cost is not the bugs. It is that each one looked different.** An invented injury, a wordy
paragraph, a wrong count and a backwards argument do not resemble each other, so each was found
separately, on a phone, after midnight, by the one person who could tell — while the suite
reported every one of them green.

## Decision

**Four rules. Each is already implemented; this records them so the ninth instance does not need
finding the same way.**

### 1. Nothing without its reason

Anything the model is asked to explain arrives **with why it is there**. Where a thing genuinely
has no reason beyond its own figures, the model is told to describe it and stop.

The vacuum is the failure mode. `generate.ts` attaches a code-written `because` to a call whose
arithmetic does not explain it — the vice armband moving because the captaincy is — and the
editorial receives each call's *kind* so it can say what sort of move it is rather than guess.

### 2. Name what it can never know, and check what comes back

The model has **no fitness, availability, news, minutes or press data**. So it is told so
explicitly, and told which words it may therefore never use.

**And an instruction is a convention.** The mechanism is a check on the returned text:
`reasoning.ts` and `editorial.ts` each refuse a line reaching past what was given and substitute a
templated one. Never a retry — a retry is a second charge for the same sentence.

### 3. Where the comparison misleads, the sentence is code's

A keep reading, a forced call and a must-change call are all written in code and never asked for.
Each is structural rather than comparative: the incumbent is not in the running, so a comparison
between the two says nothing, and a model given only their figures can produce nothing else.

**Key this to the obligation, not to a flag.** STE-150 is what happens otherwise: the explanation
was keyed to `isForced`, the flag was correctly narrowed to match `F4-AC-07`, and the explanation
stopped applying with nothing failing.

### 4. The fallback obeys every rule the primary path obeys

A rule applied to the model and not to the code standing in for it is a rule with a hole the shape
of its fallback. `templateEditorial` wrote *"1 of this week's 4 calls are forced"* for six hours
after the prompt was forbidden from writing counts, because the fix only ever looked at the prompt.

**Every template, default and fallback is in scope of the rule it stands in for**, and carries its
own test.

## Consequences

- **Widening the model's input is not the fix for bad prose.** It is how an injury gets invented.
  ADR 0008's *constrained by construction* stands; this says what to do instead — supply the
  reason, or say less.
- **Every model-facing surface needs a returned-text check, not only an instruction.** Two exist;
  a third model call added without one is a gap by default.
- **A test that asserts an instruction exists is not a test that the rule holds.** The instruction
  tests are cheap and worth having, but the checks and templates are what hold the line, and those
  are assertable directly. Both the editorial's template and its acceptability check had **no test
  at all** until 2026-09-16, which is why both were wrong and both stayed green.
- **This does not constrain what the model is for.** It proposes candidates and writes the prose;
  that is ADR 0008 and unchanged. It constrains what it is asked to do without the means to do it.
