# Manual coverage register

**Hand-maintained. This is the half of ADR 0010 a grep cannot do.**

`scripts/criteria-coverage.mjs` finds a criterion covered when its identifier appears in a test
name. That works for anything Vitest or Playwright can assert. It cannot work for the two kinds of
criterion this project deliberately does not automate:

- **Human checklist** — anything visual or tactile. CLAUDE.md's testing rule is explicit: write the
  checklist, do not fake it with a class-name assertion. A criterion about a swipe feeling right, a
  frozen column holding position, or a contrast ratio on a real screen belongs here.
- **Eval** — anything graded on model output rather than asserted. What the evals actually grade is
  still open (STE-37).

A row here is a claim that the criterion **has been verified**, with the date and where the record
is. It is not a plan to verify it later — an unverified criterion belongs in neither list, and the
coverage script counting it would make the number a lie.

| Criterion | Kind | Verified | Where the record is |
| --- | --- | --- | --- |
| F7-AC-11 | Human checklist | 2026-09-08 | Two real accounts on `fpl-advisor-dev`, signed in with real codes: neither could read, update or impersonate the other. Repeatable with `pnpm check:rls-live`. |
| F7-AC-04 | Human checklist | 2026-09-08 | A six-digit code arrived by email and was typed in. No tappable link, so no mail-client browser holds the session. Stephen received and read it. |
| F7-AC-14 | Human checklist | 2026-09-09 | Real team ID entered on dev by Stephen. The confirm card named the team back, and accepting it stored the link — the screen then read "Linked to Noggingham Forest". The automated tests cover the mapping and that resolve stores nothing; this covers the half only a person can see, that the team is actually shown back before anything is written. |
| F7-AC-10 | Human checklist | 2026-09-08 | Full sign-in on dev: `expires_at` moved from 12:29:31 to 12:29:51 across two `/api/me` calls, so the window renews on each visit. The automated test covers only the cookie's shape. |

Gaps in what the automated suite proves are recorded separately, in
`docs/coverage-gaps.md` — a register of what *is* verified must not carry prose
about what is not.
