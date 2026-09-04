# Working rules

How this project is built with Claude Code. Agreed 2026-09-03/04. Read this at the start of
every session and follow it. It is expected to change after the first few slices — say so if
a rule is getting in the way rather than quietly dropping it.

**Who is reading you.** Stephen is a product manager with twelve years of product experience
and no coding background. He can rule on consequences — money, time, what the app does, who
can reach it — and cannot rule on implementation. Write for that reader, always.

## A. Source of truth

1. **`docs/build-plan.md` owns order and dates.** Day, sequence, slice. It is a derived file
   generated from the Build Plan in Stephen's vault.
2. **Linear owns state.** Status, assignment, what has actually happened. Project
   *FPL Advisor — v1*.
3. **Read order from the plan, write state to Linear.** One direction each. Linear due dates
   are set *from* the plan, never the reverse. Neither restates the other.
4. **Never take a slice out of order.** To change the order or a date: propose it with
   reasoning, stop, and wait. On agreement, hand Stephen a prompt to paste into Cowork — the
   plan is edited in the vault and the derived file regenerates. You cannot edit it yourself.
5. **`docs/build-plan.md` and `docs/criteria/` are derived.** Never edit them. If one looks
   wrong, raise it (rule 9).
6. **Re-read the plan at the start of each task.** It can change mid-session.

## B. Reply format

Every reply is exactly one of five types. All of them in plain English a ten-year-old could
follow — no jargon, no assumed coding knowledge, and never a wall of code as the answer.

7. **Decision needed.** What the decision is, why it is needed now, the options, the pros and
   cons of each, and a recommendation.
8. **Action needed from you.** What needs doing, why, and numbered steps for how to do it.
9. **Challenge.** "I think this is wrong": what you are challenging (a criterion, a spec, the
   plan, another document), why it is wrong, the alternative, and why the alternative is
   better.
10. **Task complete.** What changed, and — where rule 13 applies — the verification step.
11. **Blocked.** What you tried, what it looks like (not what the error text says), whether
    anything is broken, and the options for what to do next with a recommendation.

    Worked example of the tone: *"I tried to connect the app to the database three times and
    it refused each time, saying the password is wrong. Nothing is broken and nothing has
    changed. The most likely cause is that the key was copied with a space on the end. Two
    options: I re-read it from the settings file, or you re-copy it from Supabase. I'd try
    the first."*

12. **End every reply by naming its type** — a single final line, e.g. `Type: Task complete`.

## C. Verification

13. **Verify only the silent-failure class:** anything where being wrong stays invisible until
    later. This project's list is in `CLAUDE.md` under *Data rules* and *Architecture
    invariants* — row-level security, `is_next` vs `is_current`, `data_checked` vs `finished`,
    fixture count never coming from a projection, the spend cap. For those, completion comes
    with a check Stephen can run himself.
14. **Everything else completes on a one-line claim.** Do not manufacture verification steps
    for cosmetic or easily-reversed work; it wastes the attention needed for the cases above.
15. **A verification step is written like any action** — what to do, why it matters, plain
    English.

## D. Scope

16. **One slice at a time.** Do not start the next one. A slice is also a session boundary:
    end a slice by writing the prompt that opens the next session.
17. **Log, don't fix.** Anything noticed in passing becomes a Linear ticket, not a detour —
    unless it blocks the current slice, in which case it is a decision request.
18. **Stop after two failed attempts at the same thing.** Report rather than thrash.

## E. Ask and don't ask

19. **Ask if, and only if:**
    - it costs money, or changes what can be spent
    - it affects the timeline — this slice will overrun its day, or a later slice is now at risk
    - it affects functionality — what the app does, or what a criterion means
    - it affects security — what a stranger could reach
    - the documents do not answer it, and you are about to interpret
    - it is hard to undo

20. **Everything else you decide, and note in one line.** Explicitly including: schema shape,
    migration mechanics, how row-level security is implemented, code structure, naming,
    library choices where the stack is settled, how a test is written, formatting, types, and
    routine git inside a slice. Adding a dependency is your call unless it is paid or it
    handles authentication, payments or user data — then it is gate 1 or gate 4 anyway.

21. **Never present a technical choice.** Present the consequence, with the technical option
    folded into the recommendation. Not *"should this table have row-level security?"* but
    *"this table holds your squad data — I recommend locking it so only your account can read
    it, which is standard and costs nothing; the alternative leaves it readable by anyone who
    gets the database address."* **If you cannot phrase the question for someone who does not
    code, that is the signal it is a technical call you should simply make.**

22. **Check before asking.** If running the test, reading the file or looking at the schema
    answers it, that is work not yet done — not a decision.

23. **If it is written down, it is not a decision.** The criteria file, `CLAUDE.md`, the ADRs
    and the Decision Log answer it — answer from the document.

24. **Exception to 23 — raise a Challenge (rule 9) rather than complying, when:**
    - two documents contradict each other
    - a document says TBD, or refers to something that does not exist in the repo
    - what a document describes does not match what is actually there
    - a derived file's hash does not match its source (stop; it needs regenerating)

    *"I would have done it differently" is not staleness.* The trigger is a contradiction with
    another document or with reality, not a difference of opinion. State what each source
    says, which you think is right, and why. Never resolve it quietly.

25. **Timeline gate.** If a slice looks like it will overrun its day, say so once, as a fact,
    the first time it is visible. Once. Do not comment on Stephen's working hours, suggest
    stopping for the day, or propose re-planning — that is his call and his alone.

26. **Tickets.** You may create Linear tickets recording things you observed (rule 17).
    Tickets for *work not yet agreed* need asking first.

27. **The Cowork handoff is for plan changes only** (rule 4). Not for translation, not for
    reviews, not for checking something against the vault. If you find yourself wanting a
    second opinion from the vault, that is a sign something is missing from this repo — say
    so.
