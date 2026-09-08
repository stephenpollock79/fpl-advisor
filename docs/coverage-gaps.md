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

**F7-AC-11 — the isolation test proves the migrations, not the projects.**
`tests/rls/isolation.test.ts` runs the real migration files against real Postgres
(pglite) and proves that a signed-in user cannot read another user's rows. What it
cannot see is whether `fpl-advisor-dev` and `fpl-advisor-prod` actually have those
migrations applied. That is a deployment fact.

*Partly closed 2026-09-08.* Both migrations are applied to `fpl-advisor-dev`, and
the grant posture was verified through the Data API: `service_role` and `anon` are
both denied on `manager`, `anon` is denied on `app_session`, and `service_role`
reads `app_session`. *Closed for dev 2026-09-08.* `scripts/live-rls-check.mjs` creates two throwaway
accounts, signs in as each with a real one-time code, and tries to read the
other's rows over HTTP exactly as the server does — then deletes both. Ten checks,
all passing. Run it with `pnpm check:rls-live`.

**Prod has neither migration**, and nothing has been verified there.

**F7-AC-10 — half of it is asserted.** `tests/auth/session.test.ts` covers the
thirty-day window and the cookie's shape. "Renewed on each visit" is a database
write on every authenticated request; it is in the code path and no test runs it,
because that needs a live project.

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
