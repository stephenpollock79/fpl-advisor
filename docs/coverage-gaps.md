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

**F1-AC-10 — the shirt number is unavailable, not unbuilt.** The criterion asks
each slot to show "kit, shirt number and surname". Kit and surname are there.
**No data source has a shirt number.** FPL's `bootstrap-static` carries
`squad_number` and it is `null` for all 654 players — checked 2026-09-09, and
empty rather than sparse. Fantasy Football IQ has no number-shaped field at all.
The design prototype shows numbers because its data is invented.

`PlayerSlot` reads the field and renders it when present, so the code is already
right and the slot is simply blank; if FPL populates `squad_number` later in the
season the numbers appear with no change. **F1-AC-10 must not be read as fully
satisfied**, and the reason is data availability rather than anything unbuilt.
STE-112 carries the decision.
