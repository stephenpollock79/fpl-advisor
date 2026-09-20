# Known gaps in what the automated suite proves

**Not a coverage claim — the opposite.** These are places where a test exists and
proves less than its criterion asks, recorded so the gap is visible rather than
inferred from a green suite.

**Every `Home:` below must name an open ticket.** Seven of them pointed at
`STE-133` — a bookkeeping ticket, which can close a gap in no sense at all — and
one pointed at `STE-68`, which closed the same day the entry was written. An
entry whose home is closed is not a record, it is a note nobody will read again,
and that is the exact failure `P14` names: *the citation must resolve both ways…
it looks checkable, and is not.* Repointed 2026-09-16 (STE-133). **When a ticket
named here closes with its gap still open, the gap needs a new home before the
ticket does.**

**This file is deliberately outside `scripts/criteria-coverage.mjs`'s view.** It
names criteria in prose, and the script counts a named criterion as covered. An
earlier draft of this section lived in `docs/manual-coverage.md` and silently
moved F7 from 2 covered to 5 — the register said "these three are not verifiable
here" and the script read it as "these three are verified". The script now reads
only the register's table rows, and this file lives apart from it as well; one
mechanism would have been enough, and two cost nothing.

Not a coverage claim — the opposite. These are places where a test exists and
proves less than its criterion asks, recorded so the gap is visible rather than
inferred from a green suite.

**F7-AC-11 — verified on both projects, and it stays a point-in-time check.**
`tests/rls/isolation.test.ts` runs the real migration files against real Postgres
and proves the migrations isolate. What it cannot see is whether a given project
has them applied, or whether PostgREST and the grants behave as expected on the
real path. That half is deployment fact, not code fact.

*Closed for dev 2026-09-08. Closed for prod 2026-09-09* — eleven checks against
`fpl-advisor-prod`, all passing, via `node scripts/live-rls-check.mjs
--project=prod`. Asking for another user's row by id returns nothing rather than
an empty filter result; the service key cannot reach user data at all, withheld by
grant; both throwaway accounts were deleted and the count verified afterwards.

**What remains, and why this entry is not deleted.** That was one moment in time.
Nothing in CI can re-run it — it needs credentials and it writes to a real project
— so a later migration can regress isolation on a deployed project and the suite
will stay green. **The live check must be re-run against both projects whenever a
user-data table is added.** Slice 3 adds two (`squad_snapshot`, `squad_player`),
and STE-108 carries that instruction.

**F7-AC-10 — the automated half is still only the cookie.**
`tests/auth/session.test.ts` covers the thirty-day window and the cookie's shape.
"Renewed on each visit" was verified by hand on dev on 2026-09-08 — `expires_at`
moved twenty seconds across two `/api/me` calls — but **no automated test runs
it**, because that needs a live project. If the sliding update is ever removed,
the suite stays green.

**F7-AC-01, F7-AC-03, F7-AC-04 are provider settings**, configured under STE-29 and
not assertable from this repo at all. F7-AC-03 in particular has no provider-level
enforcement — password sign-in is always accepted and fails today only because no
password is set.

**Asserted since 2026-09-16 by `scripts/live-rls-check.mjs`** (slice 10, STE-68),
which attempts a registration and a password sign-in against whichever project is
named. **F7-AC-03 passed on both projects. F7-AC-01 failed on both** — public
registration was on at dev *and* prod, so anyone could create an account at
Supabase's own endpoint, then sign in through our login normally and spend against
the £50 cap. `shouldCreateUser: false` in the route blocks creation through *our*
route only; the provider's signup endpoint never passes through it. *Home:
STE-159.* Neither may be read as met from the coverage figure — one is a live
provider fact that only this hand-run script can see, and the other was false.

**F7-AC-04 remains unasserted and unassertable**: it is about a code being typed
rather than a link being tapped, which is a fact about the email template and the
manager's thumb. Its manual-coverage row is from 2026-09-08.


**F6-AC-07 — closed 2026-09-16 (STE-158).** The PRD now says the control
*"always rewrites the whole week — every category — whichever screen it was
tapped from"*, which is what the app has always done. The criterion is named
again by two tests, one of which walks two tabs so *whichever screen* is a
trigger it causes rather than assumes.

**The reason it was open is the part worth keeping.** The criterion used to ask
for a control *scoped to the screen it is on*. **No run has ever been scoped** —
`run.scope` is a column with a check constraint that nothing sets, and
`POST /api/runs/stream` takes no scope — so the scoping half had never been
built, and the naming half was built and **untrue on two of the three tabs**: the
confirmation sheet said "Refresh transfers" over a run that also rewrote
captaincy and substitutions.

**A test named it and passed throughout**, because it asserted the control named
*a* scope rather than the one the run had. That is the same shape as `F6-AC-02`
and `F7-UP-02`: a test agreeing with the build instead of the requirement.

**Nothing was ever wrong with the advice.** What the wording could cost was a
*pending* call on a tab the manager believed he was leaving alone; a selected one
is carried forward and survives (`F6-AC-02`).

Ruled by Stephen on 2026-09-16 — the run keeps doing everything, the label
changes to match — and closed as a **correction rather than a change of intent**:
the criterion was describing something that was never true. Decision Log #102.

**F7-UP-05 — nobody has ever been given access, so nothing can be checked.**
Named by slice 10's cold review as in scope and uncovered, which is correct. The
criterion is about **a second person being added**: the owner creates their
account at the provider, no code is issued, nothing is shared, removing them is
deleting the account, their data is isolated by the policies already in place,
and spend is *not* isolated because the prepaid balance is one shared cap.

**Three of those are already proven and the criterion still is not.** Isolation is
`scripts/live-rls-check.mjs`'s whole job and it creates two real accounts to do
it; account creation without a password is asserted in the same run; the shared
cap is a fact about the console, not the code. What is unproven is the only part
that matters — that a **second real person** can be added and removed without
anything else changing — and it cannot be proven by a script that deletes its own
accounts thirty seconds later.

**It cannot be forced honestly.** There is one user. Manufacturing a second
permanent account to satisfy a coverage figure would create exactly the thing
F7-AC-01 exists to prevent, and it would draw on the same £50.

**So F7-UP-05 must not be read as met**, and no test may name it. It closes the
day a second person is actually given access — which the criterion itself calls
"a decision rather than a formality". *Home: STE-179.*

**F7-AC-02, F7-AC-05, F7-AC-07, F7-UP-01 — closed 2026-09-16 by slice 10
(STE-68).** The send is started and never awaited, and all three limits plus the
attempt reset are asked in one database call, so no path's duration depends on
whether the address has an account.

**The reason it was written is the part worth keeping.** Measured on 2026-09-08,
`/api/auth/request-code` returned the same body and status for an address with an
account, one without, and a throttled request — and took 3.46s, 0.045s and 0.115s
respectively, because a real send waits on SMTP. **The body was never the leak.
The clock was**, and a ~77x difference is a usable oracle for whether any address
has access. A test asserting the bodies match would have passed for the eight days
the criterion was false.

So the test that closes it asserts **ordering, not elapsed time**: it hands the
route a send that never settles and proves the answer comes back anyway.
Restoring the `await` fails it by timeout rather than by a flaky millisecond
count — verified by doing exactly that before the commit landed.

**F7-AC-16 — four claims, where the criterion says five.** Most of the criterion
is genuinely covered by `tests/e2e/landing.spec.ts`: the only screen reachable
without an account, no app header, one card, two tabs, *What he does* by default,
no sign-up path, and — since 2026-09-15 — no scroll, which is now asserted rather
than assumed.

**The count is not.** The design's fourth claim is the chip planner. **F5 is below
the cut line**, so slice 8 replaced it with team news and then dropped it outright
on Stephen's instruction, leaving four. Selling a chip planner that does not exist
on the only screen a stranger sees is the thing being avoided; being one short of
the criterion is what it costs.

**So `F7-AC-16` may not be read as met from the coverage figure.** It closes with
F5, when the design's own fifth claim comes back. *Home: STE-70.*

**F8-AC-12 — settled everywhere; what is left is a missing test.**

The criterion said the refresh control sits in the Assistant status bar labelled
ALL. Slice 8 built exactly that and Stephen moved it the same evening — header,
bare symbol, matching every other screen. **The PRD caught up on 2026-09-16**,
and `F6-AC-07`, section 3.1 and `F5-AC-06` followed it there the same day
(STE-156), so every statement about the control now agrees with the app and with
each other. The divergence and the contradiction are both gone.

**Closed 2026-09-16 (STE-178), and not by a test.** No test names `F8-AC-12` and
none should: the position of a control and the *absence* of a visible label are
exactly what `CLAUDE.md` says to put on a human checklist rather than fake with a
class-name assertion. Stephen confirmed it on the live app and it has a row in
`docs/manual-coverage.md` written from that pass — which is why the criterion
moves in the report without a line of test code being written.

**F7-AC-15 — closed 2026-09-15 by slice 8 (STE-66).** Confirming the team now
goes straight into the first advice run, which is the Thinking state every other
route into the world passes through. `tests/e2e/landing.spec.ts` exercises the
confirmation itself rather than the run button, so the criterion is covered by
its own trigger.

**Worth keeping the reason it was written.** The entry existed because a test
docblock reading `F7-AC-15 – F7-AC-26` would have counted it covered off a
range in a comment — the script reads whole files, not titles. That nearly
happened again on the day it was fixed.

**F7-AC-14 — closed 2026-09-16 by slice 10 (STE-68).** `resolve` now issues a
short-lived signed token and `confirm` refuses without one that matches the
identifier being linked, checked before the FPL read. The token carries no
identity — only an expiry and a signature reach the browser.

**Kept, because the shape of the gap is the useful part.** What follows is what
it said while it was open.

**F7-AC-14 — the confirm step is enforced in the client, not the server.**
`tests/team-link/routes.test.ts` proves that `resolve` stores nothing and that
`confirm` writes what FPL returns rather than what the browser posted. What it does
*not* prove is the criterion's own wording — "the identifier is confirmed **before**
it is linked". Nothing binds a `confirm` to a prior `resolve`: no token, no cached
candidate, no state on the row. A direct POST to `confirm` links without the team
ever having been shown back.

The route is behind a session and this is a single-user app, so nobody but Stephen
can reach it — which is why it was left rather than answered with a nonce flow. But
the guarantee is currently a UI convention wearing the shape of a mechanism, and
that distinction is the whole reason this file exists. Slice 10 (STE-68) owns the
hardening pass where it would be closed.


**F1-AC-07 — closed 2026-09-15 by slice 9 (STE-67).** The figure is now read from the
Transfers screenshot, which states it, and a parsed figure always wins.

**The gap it closes was a real one and worth remembering.** No public FPL endpoint
reports the free-transfer balance, so slice 3 reconstructed it — accrual, deduction,
cap, floor, wildcard exemption — and `tests/squad/snapshot.test.ts` covered every part.
All of it passed against the rule as it stood, which was the whole problem: **the tests
asserted the reconstruction rather than the truth**. FPL changed the cap from two to
five in 2024/25; the next such change would have left the suite green and the header
quietly wrong.

**The derivation is not deleted.** A squad captured from FPL has no screenshot behind
it and still needs one. Both live on, and the rule is that a figure from a source that
states it beats a figure worked out from rules — never the other way round.

**F1-AC-10 — closed 2026-09-09.** This entry recorded that no data source had a
shirt number: FPL leaves `squad_number` null for all 654 players and FFIQ has no
number-shaped field. That was true of the two feeds and still is. It was not true
of the world — the Premier League public API carries the numbers and joins to FPL
exactly on `opta_code`, so 530 players now have one and every regular starter
does (STE-112). Kept rather than deleted, because the reasoning that the criterion
could not be met was the thing that was wrong, and the correction is the useful
part of the record.

**F1-AC-12 — the injury and doubt markers have never been seen.** The code renders
a red INJ marker and an amber percentage, and both appear in the design prototype.
**Neither has appeared in the real app**, because every player in the squad has
been fully fit on every read so far. The criterion is built and unobserved: a wrong
colour, a clipped badge or a marker in the wrong corner would all have passed every
check made today.

It cannot be forced honestly, since the app shows what the feed says. This closes
the first week a squad member picks up a knock, and not before.

**F1-UP-01 and F1-UP-02 — the blank and double states are tested and unseen.** The
arithmetic is covered thoroughly against fabricated fixtures: a blank projects zero
whatever the projections feed carries, a double is never summed, and either is
logged. **What no test covers is what they look like.** The NO GAME pill on its
dashed border, the empty dashed difficulty track, the green multiplier and the
corner count on the pitch have all rendered only in code — gameweek 4 has no blanks
and no doubles, and the ingestion log said so by staying silent.

This is the case PRD 3.5 warns about, seen from the other side: a structure that
passes a normal week and fails the first exceptional one. The tests cover the
structure. The appearance waits for a real blank, which this early in a season
means waiting.

**F7-AC-11 — the live check exercised one table, not every user table.**
`scripts/live-rls-check.mjs` proved isolation on the real HTTP path against a
deployed project, which the pglite suite cannot. But it queried **`manager` and
nothing else**, so after slice 3 it reported a clean 11/11 while covering neither
squad table. Found by following STE-108's own instruction to re-run it: the
instruction was right, the tool it named did not do what the instruction assumed.

**Closed 2026-09-09 (STE-108).** The table list is now read from the posture
comments in the migrations — the same source the pglite suite classifies by — so
a user table with no seed recipe **fails** the run rather than being skipped.
Dev and prod both passed 28/28 across all three user tables.

**That gap closed on 2026-09-10, and how it closed is the point.** Prod could
not previously be re-checked for `squad_snapshot` and `squad_player`. Both point
at reference rows, prod's reference tables were empty, and the script may not
create them: those tables grant the service key `select, insert, update` and no
`delete`, so a seeded row could not be removed again. That is the grant working
as designed — ingestion upserts and never deletes — and weakening it so a test
could tidy up would have traded a real constraint for a convenience. **An
earlier prod run did seed, could not clean up after itself, and the rows were
removed separately; the script was then changed to refuse rather than seed.**

**STE-113 loaded prod through the app's own ingestion path** — a first sign-in on
gaffercalls.com, which fetches both feeds and writes the reference tables before
answering — and `node scripts/live-rls-check.mjs --project=prod` then ran to
completion for the first time: **28 of 28, all three user tables covered**,
including that the service key cannot reach any of them and that both throwaway
accounts were deleted afterwards. Prod was deliberately **not** loaded by copying
rows out of dev: that would have produced tables that look right while proving
nothing about the path that has to keep them current.

**It stays a point-in-time check.** Nothing in CI can re-run it — it needs
credentials and it writes to a real project — so the standing instruction is
unchanged: re-run it against both projects whenever a user-data table is added.

One thing the extended check still cannot see: a **user** table created outside a
migration. It cross-checks the project's tables against the migrations, but that
listing is served to secret keys only, and ADR 0007 withholds the service key's
grant on user data — so the cross-check covers the reference and service tables
and not the user ones. The convention that schema changes never happen through
the console is what carries that case, and a convention is not a mechanism.



**ENGINE-AC-04 — the automated half is internal consistency, not agreement
between surfaces.** The criterion has two halves: one function produces net,
conviction and band, and *every surface displaying any of the three reads that
function's output rather than recomputing it*. `tests/engine/worked-example.test.ts`
proves the first half — the three figures come out of one `evaluateCall` and
agree with each other — and cannot prove the second, because no surface exists
yet. **The half that is unproven is the half the criterion was written for.** A
component that recomputed a band from a stored conviction would pass every test
in the engine suite while producing exactly the disagreement between two screens
that the rule forbids.

*Home: STE-176.* That is where conviction first renders, and the check
is not another engine test — it is that F3's components take net, conviction and
band as values and hold no arithmetic over them.

*Closed 2026-09-11 (slice 5).* `tests/client/surface-rules.test.ts` reads the
source of every screen and fails on any value import from the engine, and fails
first if the Assistant screen is missing, so it cannot pass by scanning nothing.
Screens receive figures from `apps/client/src/calls/`, which takes them from the
run or from `evaluateCall`.

**ENGINE-AC-05 — nothing renders conviction yet, so nothing can be checked.**
Conviction must be labelled everywhere it appears as the strength of the call,
never as a probability, likelihood or chance of being right. There is no
calibration and no backtest behind the figure, which is why the wording is a
requirement rather than a preference. It is a rule about words on a screen, and
slice 4 builds no screen.

Deliberately **not** entered in `docs/manual-coverage.md`: that register holds
criteria that have been verified, and an entry made in advance would turn the
coverage figure into a claim about the future.

**Closed 2026-09-11, and again on 2026-09-14** — not on the 16th, whatever the
first version of this paragraph said. The register has carried a row since slice
5's checklist and a second from slice 7's, both recording that nothing on any
screen calls the strength figure a chance, a likelihood, a probability or a
confidence.

**This entry was two days stale and it cost a redundant check.** On 2026-09-16 it
was read as outstanding, put to Stephen as a question he had already answered
twice, and answered a third time — and a third register row was written before
anyone looked at the two already there. *An entry describing a gap that has
closed is the same defect as a home pointing at a closed ticket*, arriving from
the other direction: both look like work and are not. **When a gap closes, this
file is edited in the same change that closes it.**

*Automated half closed 2026-09-11 (slice 5).* The figure is labelled *strength*,
and `tests/client/surface-rules.test.ts` fails on probability vocabulary in any
string the Assistant can show; the model's own reasoning line is held to the same
list before it is used (`apps/server/src/model/reasoning.ts`). **What a scan cannot
see is how the screen reads to a person** — that half is item 7 of slice 5's manual
checklist, and enters `docs/manual-coverage.md` only once run.

**F3-AC-06, F3-AC-17, F3-AC-29, F3-UP-05 — three of the four closed 2026-09-15
by slice 8 (STE-66).** Each was counted covered off a test proving one half.

- `F3-AC-06` — **closed.** `tests/client/week.test.ts` gives the world a blank
  and asserts the editorial leads with the bench-order consequence, and
  `tests/e2e/overview.spec.ts` does the same in a browser.
- `F3-AC-29` — **closed.** The selected filter's scenario and the priority tally
  are in `tests/client/scenario.test.ts` and `tests/client/week.test.ts`, each
  exercised by deciding a call rather than by handing in a count.
- `F3-UP-05` — **closed.** A world whose run produced no calls now reaches the
  editorial's "why", a call count reading none, an empty tally and identical
  Before and After.
- `F3-AC-17` — **still open, and down to one trigger.** *Forced* is built and
  tested. *Watch*'s **price** trigger is built (2026-09-11), from FPL's own
  forecast in `bootstrap-static`: set on a transfer when either player is at
  FPL's strongest likelihood of a change tonight and not locked.

  **That half was thought impossible and was not.** The ticket holding it said
  FPL publishes realised price changes and never predicted ones, so a trigger
  would need a price-prediction model — which `CLAUDE.md` forbids. The forecast
  was in the payload the ingestion already read. Nothing had to be predicted;
  it is FPL's own figure, consumed as the projections are. **Check the payload
  before concluding a feed lacks something** — the absence was in the reading.

  The **press-conference** trigger has no data source, and closing it is a
  decision about whether to introduce scraping rather than a missing
  implementation. *Home: STE-163* (Post MVP), split out on 2026-09-16 when
  STE-117 closed with the half it had built — a gaps entry naming a closed
  ticket is a pointer that looks checkable and is not.

`F3-AC-17` may not be read as met from the coverage figure.


**F4-AC-02 — the tiles are tested, the swipe is not.** The criterion is that a
keep reading is *non-interactive*, and there are two independent routes into a
decision on that card: the three tiles, and the swipe. Both are suppressed in
code — the reading renders a label in place of the tiles, and the card does not
bind its pointer handlers at all — and a third lock sits behind them, in the
screen's own `onDecide`, which refuses a state change on a reading.

**Only the tiles are asserted.** `tests/e2e/assistant.spec.ts` proves no Select
or Reject control exists and that tapping the card files nothing. It does not
prove the swipe, because Playwright's synthetic pointer stream does not reach
this card's handlers: the identical gesture on a *decidable* card also files
nothing, so "no decision was posted" would be evidence about the harness rather
than about the card. Asserting it anyway would be the class-name assertion
`CLAUDE.md` forbids, wearing a gesture's clothes.

So the swipe is item 2 of slice 6's manual checklist on STE-64, and **F4-AC-02
must not be read as fully verified from the coverage figure** until that check
has run on a phone. This is the same shape as `F3-AC-07` and `F3-AC-08` in slice
5, which were verified by hand for the same reason and are in
`docs/manual-coverage.md` with the date.

**F6-AC-13 — the tags that clear themselves work; the one that is stamped on
does not.** The criterion is that each affected call carries a tag on its card
**until it has been viewed**. The transience is the criterion, not a detail: the
tag is how a manager who dismissed the *what changed* sheet finds his way back
to the cards it named.

**Two clear themselves, correctly.** `WAS 84` and `RETURNED` are derived on every
world read from the difference between the stored figure and the re-derived one.
When there is nothing left to report they stop appearing.

**One is stamped on and never cleared.** `RESURFACED`, added on 2026-09-14
closing `F6-AC-03`'s second half. `call.viewed_at` exists because
`architecture.md` §4.1 specifies it, and **nothing writes to it**, so that tag
stands until a later run overwrites the row. `NEW` and `UPDATED` are never
written at all.

**Not dangerous, because nothing acts on a tag** — it changes no figure, no
decision and no money. Corrosive, because a badge that never goes away stops
being read, and the next one that matters is not read either.

**F6-AC-13 must not be read as met.** *Home: STE-127*, filed Post MVP on
2026-09-14 — moved there from STE-65, which owns the slice and not this.

**F6-UP-03 — named by a test that proves a different half.** The criterion is
that a gameweek rollover is a clean slate: the previous shortlist, decisions,
filters and pending calls are discarded, advice is regenerated **from the squad
FPL reports at that point**, and the distinction from a within-gameweek refresh
is stated to the manager rather than implied.

`tests/refresh/guard.test.ts` names it, and what that file proves is the
*deadline stop* — that advice about a week already played is refused. **It does
not prove the clean slate, and it does not prove the squad is re-read.** The
first live rollover, on 2026-09-14, showed exactly that gap: the deadline rolled
to gameweek 5 correctly and the squad on screen was still gameweek 3's, because
picks were being read on the points rule. That defect is fixed; the criterion's
other halves are still unproven.

**F6-UP-03 must not be read as met**, and what would close it is a test that
rolls the gameweek and asserts the decisions, the shortlist and the pending
calls are gone and the squad has been captured again. *Home: STE-177.*

**F6-AC-20 — cancelling is built twice over and asserted nowhere.** A cancelled
run must be treated exactly as a run that never started: recorded `cancelled`
rather than `failed`, nothing written, and the last-run time unmoved.

**Until 2026-09-14 it was not built at all.** The handler only noticed a
cancellation if something threw, and a model call that never returns never
throws — so the run sat at `running` for ever while the manager saw a cancel
that appeared to work. It is now caught twice: a listener on the request's abort
signal, and a check immediately after the run row is created, so a cancel that
lands in either window is recorded.

**Neither catch is covered by a test, and the reason is the harness rather than
the will.** A cancellation is the connection closing, and Hono's in-process
request cannot be disconnected — an `AbortSignal` passed through `app.request`,
and a `Request` constructed with one directly, both leave the signal the handler
reads unaborted. A test that passed against that harness would be proving
something about the harness.

**Nor does the phone close it.** Stephen confirmed on 2026-09-14 that cancelling
returns the screen to its calls with nothing changed, which is the half he can
see. What neither he nor the suite can see is the `run` row — and *that* is the
half the criterion is about, because a cancel recorded as `failed` is a failure
put in front of him for something he chose to do.

**What would close it:** read the `run` row after cancelling a real run and
confirm its status is `cancelled`. *Home: STE-180.*

**F6-UP-03's stop has been run against real data once, and only in the direction
that proves nothing.** On 2026-09-14, on `97bc6c7`, opening the app with gameweek
5 ahead correctly showed **no** stop. That is the check working — it does not
fire when the week is fine — and it is worth having, because a false positive
would have made the app unusable and would have shown up immediately.

**What it does not establish is that the stop fires when it should.** Nobody has
seen the red card against a real passed deadline. The unit tests cover both
directions with fabricated clocks; what is unobserved is the state on a phone.

**It does not close itself, and why not is the useful part.** The plan was to open
the app after GW5 locked on Friday 18 September and before GW6 became next, and
watch the stop fire. **That interval never existed.** Checked against the live
feed two hours after the deadline: FPL had already set `is_next` to GW6, and did
so at the deadline itself.

**So the stop can only fire on stale data of our own.** The app advises on
`is_next`, and FPL points that at the next gameweek whose deadline has *not*
passed — so the deadline being checked is in the future by construction. The only
way `deadline_passed` fires is a stored copy that did not keep up: feeds
unreachable across a deadline, or an ingest that failed. That is a real fault and
the guard is right to exist; it is simply not a state normal operation reaches,
because opening the app re-reads the feeds.

**Which makes the fabricated-clock unit tests the verification, rather than a
stand-in for a live check that was going to happen anyway.** The residual is
narrow and worth stating: a deadline crossed inside the two-minute feed-coalescing
window, or one crossed while the feeds are down — and in the second case the
frozen-feeds strip is already on screen saying so.

What *was* seen on 18 September, two hours after the deadline: the app on GW6
with the right deadline and no run yet, rather than still advising on a week
already locked. That is the outcome this criterion protects, reached by the feed
being right rather than by the stop firing. *Home: STE-154.*

**F6-AC-02 is asserted on a screen, never across a refresh — which is the only
circumstance the criterion is about.** `tests/e2e/assistant.spec.ts` names it and
passes: it opens a world in which the selected call is present and checks the
card reads *selected · locked*. It never runs a refresh.

That is exactly where the rule was broken. Until 2026-09-14 (STE-132) a selected
call was applied to the next plan as a constraint and emitted no card, so the
moment a refresh wrote a new run the accepted call vanished from the screen and
the decision row pointed at nothing. The green tick said otherwise for four days.

**Half of it is closed.** `tests/runs/routes.test.ts` now proves the call is
carried into the run it constrained, whole and repositioned after the new calls.
What is still unproven end to end is the two halves joined: accept a call,
refresh, and see the card still there reading *selected · locked*.

**What would close it:** an end-to-end spec that decides a call, runs a refresh,
and asserts the card survives it. *Home: STE-177.*

**The armband's forced behaviour is deliberately uncovered, and that is a
settled decision rather than an open question.** Ruled 2026-09-20 (STE-189,
Decision Log #108): a club with no fixture no longer forces the armband, because
the ranking sinks a player who cannot score. A holder the **availability gate**
excludes still is — the engine marks any call forced whose incumbent fails that
gate, and that rule is shared with substitutions (`F3-AC-17`).

So the behaviour exists and **no `F4` criterion names it.** Four tests assert it
and cite a ticket, because there is nothing else to cite, and **nothing in the
coverage report will ever go red for it.**

**This entry differs from every other one here**, and the difference is the
point. The rest record something unproven and name the check that would close
them. This records something *proven and uncoverable* — the tests are real, the
behaviour is right, and the gap is in the reporting rather than in the work.

**Why it is not closed by writing a criterion.** `F4` carries seven identifiers
against a cap of five and was the first feature brought back toward it. Spending
another on when a flag is set would undo that, to cover a case the ranking
already handles on screen.

**What would change it:** `F4` having room, or the engine's shared forcing rule
being revisited for some other reason. Neither is worth doing for this alone.
*Home: STE-189.*
