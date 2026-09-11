# ADR 0002 — Deploy target: Railway, with Replit as the fallback

- **Status:** Accepted, 2026-09-03. Written as an ADR 2026-09-11 (STE-89).
- **Deciders:** Stephen
- **Related:** Decision Log #69 (the argument), ADR 0004 (the workflow that deploys to it), ADR 0005
  (one service serving client and server), STE-30, STE-75, STE-91

## Context

The deploy target had been recorded as Replit, on the reasoning that Railway had been cancelled. It
had not: the "cancelled" markers were renewal reminders for August 2027. The swap was routing around
a subscription that was never going away.

## Decision

**Railway is the runtime. Replit is the documented fallback. Cloudflare Pages/Workers is not an
option** — it was listed without being a tool Stephen has.

Railway sits behind GitHub, so push → PR → CI → merge → deploy is the loop (ADR 0004). Replit's real
value — its in-browser IDE and agent — would go unused, because the work happens in Claude Code
locally against GitHub.

## Consequences for the build

- **Three concerns, separately replaceable:** GitHub owns source, Railway owns runtime, Supabase owns
  data.
- **One Railway service** serves the built client, the SPA fallback and every `/api/*` route (ADR
  0005). It deploys on merge to `main`, after CI.
- **`/api/health` is the deploy check.** Railway's health check points at it, and it reports the
  running commit, so "is the merge live?" is answered by the app rather than by the dashboard.
- **Node is pinned** to the same major in CI and on Railway (STE-75); the health route reports the
  version the process actually runs.
- **The app's address is `gaffercalls.com`** (STE-91).

**The lesson recorded with it, in #69:** a decision stored with a wrong reason keeps misleading later
reviews. A document states the current fact; the reasoning lives in the log, where it can be dated
and overturned.
