# Known gaps in what the automated suite proves

**Not a coverage claim — the opposite.** These are places where a test exists and
proves less than its criterion asks, recorded so the gap is visible rather than
inferred from a green suite.

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
password is set. That is asserted in slice 10 (STE-68), not here.


**F7-AC-02, F7-AC-05, F7-AC-07, F7-UP-01 — the identical response is not yet
identical.** Measured on 2026-09-08: `/api/auth/request-code` returns the same
body and status for an address with an account, one without, and a throttled
request — but takes 3.46s, 0.045s and 0.115s respectively, because a real send
waits on SMTP. The body is not the leak; the clock is, and a ~77x difference is a
usable oracle for whether an address has access.

**So none of those four may be ticked off against the matching body.** A test
asserting the bodies match would pass while the criterion is false — the same
shape as asserting a policy exists rather than that isolation holds. Recorded in
full on STE-68, which owns the fix.

**F7-AC-15 — only the first half exists.** The criterion is "onboarding is one
screen and one run: the team link on first log in, **then the first advice run**,
which behaves exactly like the start of a new gameweek." Slice 2 builds the link
screen and gates it on `needsTeamLink`, so the one-screen half holds and there is
no second onboarding state. The run does not exist — accepting the team lands on a
placeholder, and the Thinking state arrives with F6 and F8. **F7-AC-15 must not be
ticked off against slice 2**, and no test names it.

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


**F1-AC-07 — the free-transfer figure is tested, and the tests cannot see the risk.**
`tests/squad/snapshot.test.ts` covers the accrual, the deduction, the cap, the floor
and the wildcard exemption. Every one of those passes against the rule as it stands
today, which is the whole problem: **no public FPL endpoint reports the balance**, so
the figure is reconstructed rather than read, and the tests assert the reconstruction
rather than the truth.

If FPL changes the accumulation rule — the cap was two until 2024/25 — the suite stays
green and the header goes quietly wrong. That is the same shape as asserting a policy
exists rather than that isolation holds. **F1-AC-07 must not be read as fully
verified**, and the check that would settle it is reading the count from the F2
screenshot, which states it. STE-110 owns the decision; `docs/specs/architecture.md`
§8.4 carries the detail.

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

*Home: STE-62, slice 5.* That is where conviction first renders, and the check
is not another engine test — it is that F3's components take net, conviction and
band as values and hold no arithmetic over them.

**ENGINE-AC-05 — nothing renders conviction yet, so nothing can be checked.**
Conviction must be labelled everywhere it appears as the strength of the call,
never as a probability, likelihood or chance of being right. There is no
calibration and no backtest behind the figure, which is why the wording is a
requirement rather than a preference. It is a rule about words on a screen, and
slice 4 builds no screen.

Deliberately **not** entered in `docs/manual-coverage.md`: that register holds
criteria that have been verified, and an entry made in advance would turn the
coverage figure into a claim about the future.

*Home: STE-62, slice 5*, as the first slice that puts the figure in front of
anyone.
