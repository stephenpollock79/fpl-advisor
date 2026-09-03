<!-- DERIVED FILE — DO NOT EDIT. Regenerate with extract-criteria.py. -->
<!-- source: PRD - The FPL Advisor.md -->
<!-- source-sha256: 1b3e718f8914f118 -->

# The recommendation and conviction engine

*Extracted verbatim from the PRD, which remains the single source of truth for every criterion below. Edit the PRD, then regenerate — never edit this file.*


#### The recommendation and conviction engine

This governs every feature below that produces calls — F3 and F4. It does **not** govern F5 or F9: neither the season chip plan nor a chip proposal carries a call or a conviction figure, and both are advice at season scale, excluded from every tally.

**Who does what.** The model does the judging; code does the arithmetic. Five steps:

1. **The model proposes the week's candidate calls**, reading the squad, fixtures, prices, the injury/team-news sources and the opinion sources named in Section 2.1. It is not restricted to ranking what a formula surfaces — a differential punt, a fixture-swing play or a sell-before-the-price-drop are all legitimate proposals.
2. **The model returns structured judgement inputs** for every player involved, each with a quoted piece of evidence from the material it was given — Rotation and the two trust factors always; Availability only when it is overriding FPL's own figure (see below).
3. **Code computes** the edge and the conviction figure from those inputs.
4. **The model writes the reasoning**, which may reference only dimensions shown on the card. **Enforced, not just instructed:** the reasoning call is given only the field values shown in that card's evaluation table — not the broader evidence/news/opinion context used to produce the judgement inputs — so referencing anything else is a hallucination from nothing, not a citation of real but hidden data. A deterministic keyword check against a blocklist of excluded-field vocabulary is the second-line catch, not a second model call; a flagged line falls back to a templated sentence built from the table's own winning-row highlights rather than retrying the model.
5. **Code assigns the band and decides what the manager is shown.**

The model never emits a conviction percentage. This is not a claim that the output is deterministic — the model supplies the inputs, so it does shape the number — but it buys three things a bare percentage cannot: the inputs can be constrained to a small labelled scale, which is far more stable across runs than a free-form figure; when the number does move, there is a named input to point at, which is what the refresh diff reports; and the judgement can be checked, because "is there evidence in the supplied material for rating him a major doubt?" is answerable and "is 82% correct?" is not.

**Contingency.** If this formula does not hold up in practice — surfaced by the week-one calibration pass or the model-stability check — the fallback is letting the model emit the conviction figure itself, anchored to its own prior score the same way refresh anchors judgement inputs, rather than continuing to rework the formula. Recorded so the decision, if it comes up, isn't made from scratch.

**The four judgement inputs**, split by what they actually do:

*Value-affecting — these multiply the projection, they are not penalties.*

| Input | Detail |
| --- | --- |
| Availability | Will he be fit to play at all? **Bought, not judged, by default.** FPL's own feed already publishes a `chance_of_playing_next_round` percentage per player — read directly onto the same five-point scale (0 · 25 · 50 · 75 · 100 to out (0) · major doubt (0.25) · even (0.5) · likely (0.75) · nailed on (1.0)), no LLM call needed for the ordinary case. The model overrides this only when fresher evidence from the team-news sources (Premier Fantasy Tools, Premier Injuries) contradicts what FPL's field shows — for example a press conference in the last few hours FPL has not reflected yet — flagged via News freshness, and must cite the contradicting evidence when it does. |
| Rotation | Fit, but will he start and finish? Same five-point scale and multipliers. Evidence: recent selection pattern, fixture congestion, European or cup involvement, a manager's stated intentions. |

*Trust-affecting — these reduce confidence in the estimate without changing it.*

| Input | Detail |
| --- | --- |
| Projection reliability | How much weight can the projected figure carry for this player — small sample (a new signing, two games back from injury), or returns driven by volatile sources such as penalties, set pieces or bonus points. |
| News freshness | Has the information this call rests on already expired — a press conference not yet held, a price change due tonight, lineups unannounced, or simply a stale data pull. |

Each trust factor returns *clear · elevated · unresolved*. There is no fifth factor and the model may not invent one.

Putting availability and rotation inside the points rather than beside them is the whole reason the split works: a player with a 25% chance of starting does not have his projection minus a penalty, he has a quarter of it. A model that judged a player unavailable can never produce a card whose figure recommends buying him — the number is built from the same judgement the reasoning reports, so the two cannot contradict each other.

**Computing the edge.**

| Rule | Detail |
| --- | --- |
| Projection source | Per-player projected points come from a bought-in, explicitly-licensed feed (see 3.4). No projection model is built in-house. |
| Effective points | Effective points = availability multiplier × rotation multiplier × the feed's projection. |
| Horizon | A transfer is a multi-week commitment and is scored over the next three gameweeks, weighted 1.0 / 0.6 / 0.35. A substitution, a captaincy call and a vice call are one-week decisions — the manager re-picks the eleven and the armband every week — and are scored over this gameweek only. |
| Net | The effective-points difference between the two sides of the call, signed. |
| Captaincy | Moves one extra copy of a player's points, so the armband's net is the plain difference; with the Triple Captain chip live it moves two, and the net doubles. |
| Captaincy ceiling | Doubling a score rewards the upper tail, but the bought-in feed publishes a mean and no distribution, so xPts cannot express it and no distribution is modelled in-house. The gap is closed by rule, in the one place the mean is admittedly uninformative: **among candidates within the noise floor of the highest effective points, the challenger put up against the incumbent is the one with the greater ceiling**, ranked by two published, non-modelled signals in order — whether he takes penalties, then position (FWD, MID, DEF, GK). This decides *which* option is compared, never whether a change is recommended: an incumbent inside the floor still resolves to a keep reading, and no sub-floor call is ever rendered as a change. The window is deliberately the noise floor itself, because that is exactly where the means have already been declared indistinguishable — a 7.2 defender and a 7.0 forward separated by 0.2 sit inside it, and the armband should not be handed to the defender on 0.2 of mean. Captain and vice only; substitutions and transfers score on the mean alone. |
| Vice armband | Only pays if the captain does not play, so a vice call's net is the difference multiplied by the probability the captain misses. In an ordinary week this is near zero, and the vice will almost always resolve to a no-change reading (below). |
| Points hits | Subtracts directly from net, on the call that incurs it. It is a real cost in the same unit and belongs in the edge, not in a separate display. |
| Money | Deliberately not in the score. Cash is not points, and setting an exchange rate between them is a modelling exercise this build is not doing. Affordability stays a hard constraint stated separately (F3's scenario validation); a call is not given a worse percentage for being expensive. Hard constraint means the *plan* is invalid and says so, not that the interface blocks the manager: he can always select a call he cannot afford, and NBal goes negative and red with the breach named in numbers. |

**Computing conviction.**

| Rule | Detail |
| --- | --- |
| Base formula | `base = 100 × net ÷ (net + k)`, a curve with diminishing returns that cannot exceed 100. **Net is non-negative by construction, and that is a precondition of the formula rather than a coincidence.** Code compares the incumbent against the best alternative and the winning side *is* the recommendation (see *Which way the recommendation points* below), so the figure is always the edge of the option being recommended. Fed a negative net the curve does not simply go negative: it is undefined at `net = −k`, and below that it returns a large **positive** number that would clamp to 95 and read as *certain* — the exact inversion 3.4's single-source-of-truth contract forbids. The function must therefore reject a negative net rather than compute one; any code path that can hand it one is a defect. |
| k (per call type) | "The gain that should read as a coin flip" — the cost of taking that action, expressed in points. Set per category because the actions cost different things — see table below. |
| Trust haircut | The two trust factors then apply a haircut: *elevated* −8, *unresolved* −20 each. |
| Clamp & bands | Clamp to 5–95. Band edges are exact, so the refresh rule below has something to test against: **certain ≥90 · strong ≥80 and <90 · lean ≥60 and <80 · thin <60**. |
| Single source of truth | One function produces net, conviction and cash cost per call, and every surface reads from it, so no two surfaces can disagree about a call. |
| What the bands cost at the starting constants | Stated so the tuning pass has something to test against rather than a feeling. On a transfer (k = 2.0) the bands begin at these nets, in points across the three-gameweek horizon: *lean* at +3.0, *strong* at +8.0, *certain* at +18.0. A realistic transfer edge is perhaps +2 to +6 over three weeks, which reads *thin* or *lean* — so on the starting constants few real transfers would ever be labelled Recommended and the Overview's *Forced and recommended* filter would be near-empty most weeks. That may be honest, or it may mean k is too large for transfers. It is what the week-one pass exists to settle (Section 4, #25), and it is to be checked with a pencil against a plausible week **before** build, not only after a live one. |

| Call type | k | Why |
| --- | --- | --- |
| Substitution | 0.5 | Free and reversible; no scarce resource is spent |
| Captain / vice | 0.8 | Also free and reversible, and re-picked every week. The variance the armband actually exposes is handled by the ceiling tie-break above, not by k |
| Transfer | 2.0 | Consumes a free transfer that could have been banked |

Starting values, set by judgement, to be tuned once against a real gameweek's calls and then fixed — not fitted to data.

**Which way the recommendation points.** Code compares the incumbent against the best alternative and the winning side *is* the recommendation — the conviction figure is always confidence in the recommendation being made, never in a change the app is not proposing. Two cases resolve to keeping what is there, and both render as the non-decidable "no change · nothing to do" reading, excluded from every tally and never shown as a low-percentage change: the incumbent wins outright, or the challenger wins by so little that conviction falls below the **noise floor of 20** — the point at which the two options are indistinguishable given the inputs. The floor is a starting value tuned alongside the k values, not a fitted one. On a transfer at k = 2.0 that floor sits at a net of roughly +0.5 points — it is doing more work than the word *indistinguishable* suggests, and it moves whenever k does.

**Worked example — one transfer, end to end.** Illustrative figures, but every step is a step the build actually performs, and the arithmetic is the specification's own.

| Step | Out — Wood | In — Ekitiké |
| --- | --- | --- |
| Feed projection, GW *n* / *n+1* / *n+2* | 2.6 · 2.9 · 2.4 | 4.8 · 5.1 · 4.4 |
| Availability multiplier (source) | 1.0 — FPL's own `chance_of_playing_next_round` at 100 | 1.0 — same |
| Rotation multiplier (source) | 0.75 *likely* — model, cited: rested for the cup tie | 1.0 *nailed on* — model, cited: every minute since the move |
| Effective points per week | 1.95 · 2.18 · 1.80 | 4.80 · 5.10 · 4.40 |
| Weighted over the horizon (1.0 / 0.6 / 0.35) | 1.95 + 1.31 + 0.63 = **3.89** | 4.80 + 3.06 + 1.54 = **9.40** |

Net = 9.40 − 3.89 = **+5.51**. No points hit (one free transfer, one call). Base = 100 × 5.51 ÷ (5.51 + 2.0) = **73.4**. Trust factors: projection reliability *elevated* (Ekitiké is eight league games into a new club) − 8; news freshness *clear* − 0. Conviction = **65 · lean**. Above the noise floor of 20, so it renders as a call; below 80, so it is not Recommended and does not enter the *Forced and recommended* filter.

Two things to read off it. A single *elevated* trust factor costs eight points of conviction — most of a band, and enough to move a call across a boundary from just inside *strong* to *lean*, though not in this example. And a swap that nearly doubles a slot's projection still lands in *lean*, which is the calibration question #25 exists to answer.

**What is deliberately not built.** No projection model of our own. No learned or fitted weights. No calibration against outcomes — with no track record and no backtest in scope, the figure states how strong a call is, not how likely it is to be right, and must be labelled that way. No factor beyond the four above.
