# Architecture decision records

Numbering, so the first four are not renumbered later.

**0001, 0002 and 0003 are conversions of Decision Log entries** (#68, #69, #70) that predate the
repo. Their decisions were made on 2026-09-03; the files were written on 2026-09-11 (STE-89), which
is why they are dated later than 0004 and 0005, which cite 0002.

| ADR | Subject | Status |
| --- | --- | --- |
| 0001 | Data source ownership — FPL owns fixtures, FFIQ owns the number | Accepted 2026-09-03, written 2026-09-11. Decision Log #68 |
| 0002 | Deploy target: Railway, with Replit as fallback | Accepted 2026-09-03, written 2026-09-11. Decision Log #69 |
| 0003 | No scheduled refresh; gameweek boundaries read from the feed | Accepted 2026-09-03, written 2026-09-11. Decision Log #70 |
| 0004 | Development and deploy workflow | New, 2026-09-03 |
| 0005 | Framework and rendering approach | New, 2026-09-03 |
| 0006 | Repo layout and the engine boundary | New, 2026-09-03 |
| 0007 | Session transport — our own cookie, never a provider token in the browser | New, 2026-09-08 |
| 0008 | The reasoning interface — Claude Agent SDK, two auth paths, one pinned model | New, 2026-09-08 |
| 0009 | Model routing and cost control | New, 2026-09-08 |
| 0010 | Criterion identifiers in test names | New, 2026-09-08 |
| 0011 | The shared permission file is the last word | New, 2026-09-08 |

**The Decision Log stays the fuller record.** An ADR states the decision and its consequences for the build;
the Decision Log holds the argument, the alternatives and who decided what. Cite it by number (#68) rather
than restating it — same one-home rule that governs acceptance criteria.

**With one limit, and it is the whole of CLAUDE.md's citation rule applied here.** The Decision Log is
in the vault, so an agent in a checkout cannot open it. *Do not restate the argument* is therefore
never a licence to leave out the decision or its consequences: an ADR whose actionable half is only
in the log is an ADR that cannot be followed. Cite the log for **why**, never for **what to do**.
