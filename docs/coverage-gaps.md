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

**F7-AC-11 — the live check exercises one table, not every user table.**
`scripts/live-rls-check.mjs` proves isolation on the real HTTP path against a
deployed project, which the pglite suite cannot. But it queries **`manager` and
nothing else.** The pglite suite is the generic one — it enumerates every table
with a user posture and would fail on a new one that forgot its policy — and it
runs against the migration files rather than against a project.

So after slice 3 the two halves cover different things and neither covers the
overlap. `squad_snapshot` and `squad_player` are proven by the suite to be
isolated *by their migration*, and proven by nothing to be isolated *on dev or
prod*. Both were re-run on 2026-09-09 after slice 3 deployed, both passed, and
that pass does not mean what STE-108 asked it to mean.

**Found by following STE-108's own instruction**, which said to re-run the live
check when the new tables landed. The instruction was right; the tool it named
does not do what the instruction assumed. Extending the script to walk the user
tables the way the suite already does is the fix, and it is STE-108's to carry.

