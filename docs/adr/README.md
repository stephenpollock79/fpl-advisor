# Architecture decision records

Numbering, so the first four are not renumbered later.

**0001, 0002 and 0003 are numbers, not files.** They are reserved for conversions of entries already
written up in the vault Decision Log — the reasoning exists, it just needs the ADR shape — and none
of the three has been written yet. The *Status* column below says which are real, because a table
that lists ten ADRs when seven exist is exactly the unresolvable pointer CLAUDE.md's citation rule
forbids.

**Until they are written, cite the rule and not the number.** The decisions themselves are already
stated in `CLAUDE.md`: data source ownership under *Data rules*, Railway under *Stack*, and no
scheduled job under *Do not*. An agent needing to act on one of the three reads it there. ADR 0004
and ADR 0005 each carry a `Related: ADR 0002` line that currently resolves to nothing — left in
place rather than deleted, because the reference is correct and it is the file that is missing.

| ADR | Subject | Status |
| --- | --- | --- |
| 0001 | Data source ownership — FPL owns fixtures, FFIQ owns the number | **Not written.** Reserved. Rule is in `CLAUDE.md`, *Data rules*. Decision Log #68 |
| 0002 | Deploy target: Railway, with Replit as fallback | **Not written.** Reserved. Rule is in `CLAUDE.md`, *Stack*. Decision Log #69 |
| 0003 | No scheduled refresh; gameweek boundaries read from the feed | **Not written.** Reserved. Rule is in `CLAUDE.md`, *Do not* and *Data rules*. Decision Log #70 |
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
