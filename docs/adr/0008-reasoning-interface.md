# ADR 0008 — The reasoning interface

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** ADR 0009 (model routing and cost control), STE-24, STE-37, ENGINE criteria
- **Source:** *Tooling and Infra — The FPL Advisor* (vault). The rule crosses; the page does not.

## Context

The model call is the only part of this build that costs money per use, is non-deterministic, and
sits behind a vendor. That combination makes it the one interface worth naming as an interface
rather than letting it grow wherever it is first needed.

Two authentication paths exist for the same code. While iterating and running evals, the logged-in
Claude Code session is used — subscription capacity, no metered cost. In production the same code
path uses an API key against the prepaid balance. Keeping both behind one interface is what keeps
the local-web-app fallback (the delivery rung below a hosted app) available as a configuration
change rather than a rebuild.

## Decision

**One module owns every model call, via the Claude Agent SDK, authenticating two ways behind one
interface.** It lives in `apps/server` — never in `packages/engine`, which declares no dependencies
(ADR 0006), and never in the client, which must never hold a key (NFR Security).

Three conditions travel with it, and they are build requirements rather than preferences:

1. **The model is pinned explicitly in both paths.** Not "latest", not a default, not an alias that
   resolves differently in two months. An unpinned model means the evals stop describing what
   actually shipped — the eval passes, the app behaves differently, and nothing on either side
   says so. This is a silent failure in the G7 sense and its verification is reading the pinned
   identifier back off a run record, not trusting the config.
2. **Eval sweeps are batched deliberately.** Subscription capacity is shared with real Claude Code
   and Cowork work, so a sweep is something started on purpose, not a watcher.
3. **The reasoning call is mocked in most integration tests.** Only a small, *named* set hits a real
   model. Named is the operative word: a test that quietly reaches the network is a test that fails
   on a train and costs money in CI.

**What the model is allowed to do is fixed by CLAUDE.md's architecture invariant and is not
re-litigated here.** The model proposes candidates and writes the reasoning. Code computes net,
conviction and band from published data alone — no model-supplied value enters any figure shown. The
model never emits a conviction percentage.

**Every model call is recorded against its run** — model identifier, step, input and output tokens,
and cost — from the first commit. See ADR 0009 for why the figure has to exist before there is a
bill to explain.

## Amendment, 2026-09-11 — two backends behind the one interface (STE-62)

**The Agent SDK is the local backend only. Production calls the Messages API directly.**

Measured on the first live runs of slice 5: the Agent SDK runs the whole Claude Code harness around
every call, and the harness's context dwarfs the prompt. One reasoning call of about 600 tokens of our
own arrived at the model as **117,000 to 270,000 input tokens**, and one run cost about $1.44 at list
price against ADR 0009's guide of about $0.07. Some of that is this machine's plugins and connectors,
which Railway does not have; the harness's own base prompt is not, and nothing short of a paid
production run could say how much remained.

So the interface stays one module, and what sits behind it depends on where it runs:

- **Production — an API key is present.** The plain `@anthropic-ai/sdk`, one Messages API request per
  call, carrying our prompt and nothing else. A run is estimated at about a penny.
- **Local and evals — no key, by rule.** The Agent SDK, authenticating through the logged-in Claude
  Code session. Its harness overhead is subscription capacity, never the prepaid balance.
- **Mock** — unchanged, first-class, no call.

The choice is made from the environment in one place (`modelFromEnv`), and **every call records which
route it took** alongside the model identifier the provider reports it ran. The three conditions above
hold on both routes: models pinned explicitly, sweeps batched deliberately, integration tests mocked.

Ruled by Stephen, 2026-09-11, recorded on STE-62. The alternative — keep the Agent SDK in production and
measure the first run — was put and declined.

## Consequences

- The interface is swappable, so the delivery rung below a hosted app stays reachable without a
  rewrite.
- **What the evals grade is still open (STE-37) and is deliberately not decided here.** An outcome
  backtest at three or four gameweeks would be confidently wrong given FPL's variance; the honest
  version is a process rubric. That decision does not block this one — this ADR settles where the
  call lives and how it authenticates, which the evals need whatever they end up grading.
- The pinned model identifier is a value that appears in three places — production config, eval
  config, and the run record. The run record is the one that can be checked after the fact, so it
  is the one that counts as evidence.
- A `mock` mode is a first-class path, not a test fixture bolted on later. The Thinking state
  (F6-AC-16 to F6-AC-19) can then be built and demonstrated without spending anything.
