# ADR 0009 — Model routing and cost control

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** ADR 0008 (the reasoning interface), STE-24, STE-52, NFR Cost control, F6-RS-08
- **Source:** *Tooling and Infra — The FPL Advisor* (vault). The rule crosses; the page does not.

## Context

The Cost control NFR owns the spend cap and states plainly that a per-user ceiling in application
code is **deliberately not built**: the hard cap is a £50 prepaid balance in the Anthropic console
(STE-52), external and simple, and it fails hard rather than gracefully.

That is the ceiling. It is not a design. Under it sit choices about what each call costs, and the
gap between a well-shaped call and a careless one is roughly thirty-fold — large enough that the
cap would be reached by accident rather than by use.

## Decision

**Route by job, cache within the gameweek, and never send a raw feed to a model.**

| Rule | Detail |
| --- | --- |
| Routing | **Filtering and extraction go to Haiku; the reasoning call goes to Sonnet.** The candidate-proposal sweep reads a lot and decides little; the reasoning step reads little and has to word it well. There is no judgement call to route — the engine has no model-supplied inputs (STE-60). |
| Never raw | **`bootstrap-static` never enters a prompt.** It is roughly 700 players of full records. Sending it costs about **$2 a call against a ~$0.07 budget** for a properly shaped one — a single mistake that consumes 4% of the season's cap. Prompts are built from projected, named fields, never from a feed response passed through. |
| Cache | Cache what is stable within a gameweek: fixtures, the projection set, and any stored call whose evidence has not moved. F6-RS-08 already requires the strongest form of this — **if no new evidence has landed, the model is not called at all.** |
| Logging | **Tokens and cost are recorded per run from the first commit**, per call and per step (ADR 0008). |

## Consequences

- **The £50 cap stays the only enforcement, and that is deliberate.** Nothing here is a second
  ceiling; these are rules about call shape. Adding an in-app counter would be building the
  mechanism the NFR rejected.
- **The verification for the cap is a console reading, not a test** — open the Anthropic console and
  read the balance. This project's working rules already say so (P7), and it is repeated here
  because an ADR about cost is exactly where someone would otherwise go looking for a test that
  does not and should not exist.
- **The per-run token figure is the early-warning signal the cap does not give.** The prepaid balance
  says nothing until it is gone; a run that suddenly costs thirty times the last one says it
  immediately. It has to be recorded from the first commit because the useful form of it is a
  comparison against previous runs, and that history cannot be added retroactively.
- The routing split is a starting judgement, not a measurement. The first real runs will say
  whether the filtering step needs the stronger model; nothing here should be defended after
  evidence arrives.
