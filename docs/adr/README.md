# Architecture decision records

Numbering, so the first four are not renumbered later. The first three are conversions of entries already
written up in the vault Decision Log — the reasoning exists, it just needs the ADR shape:

| ADR | Subject | Source |
| --- | --- | --- |
| 0001 | Data source ownership — FPL owns fixtures, FFIQ owns the number | Decision Log #68 |
| 0002 | Deploy target: Railway, with Replit as fallback | Decision Log #69 |
| 0003 | No scheduled refresh; gameweek boundaries read from the feed | Decision Log #70 |
| 0004 | Development and deploy workflow | New, 2026-09-03 |
| 0005 | Framework and rendering approach | New, 2026-09-03 |
| 0006 | Repo layout and the engine boundary | New, 2026-09-03 |
| 0007 | Session transport — our own cookie, never a provider token in the browser | New, 2026-09-08 |
| 0008 | The reasoning interface — Claude Agent SDK, two auth paths, one pinned model | New, 2026-09-08 |
| 0009 | Model routing and cost control | New, 2026-09-08 |
| 0010 | Criterion identifiers in test names | New, 2026-09-08 |

**The Decision Log stays the fuller record.** An ADR states the decision and its consequences for the build;
the Decision Log holds the argument, the alternatives and who decided what. Cite it by number (#68) rather
than restating it — same one-home rule that governs acceptance criteria.
