# The Gaffer

A personal decision-support app for Fantasy Premier League. Before each weekly deadline it issues a short list of **calls** (transfers, substitutions, captain and vice), each with a conviction percentage, the projected points it gains or costs, and the reasoning behind it.

Built solo in under three weeks during a self-directed sabbatical in AI-native product management. I'm a product manager: I directed this build rather than hand-wrote it.

## Demo video

https://github.com/user-attachments/assets/12038f10-a138-49e8-9d00-0acf82a0a862

## What it does

Reads my real squad from FPL's public feed, corrected by uploaded screenshots when I've changed something since the last deadline, and combines it with fixtures, injury news and a bought-in projection feed to issue the week's calls.

## Why there's no public link

The app runs on a Claude API licence, so every recommendation carries a real usage cost. Access is restricted to me for that reason. The video above is the demo.

## How it was built

**Process.** Problem brief → clickable prototype and design system → PRD and architecture decision records → sliced into tickets → built in daily slices, each reviewed by a fresh AI session before it was called done.

**Scale.** An 11-screen clickable prototype in about two days · 240 acceptance criteria extracted from the PRD · 12 build slices.

The full phase-by-phase story, including what didn't work: **[My project workflow](https://github.com/stephenpollock79/stephenpollock79/blob/main/playbook/project-workflow.md)**.

**Tools.**

| Tool | Used for |
| --- | --- |
| Claude Code | the build itself, locally against GitHub |
| Claude Cowork | PRD, planning and decision records |
| Claude Design | prototype, screen flow and design system |
| Obsidian | the project's second brain: PRD, build plan, decision log and daily journal |
| Linear | tickets, slices and milestones |
| GitHub | source, PRs, pre-commit hooks |
| Railway | deploy |
| Supabase | Postgres and Auth |
| Claude API | the reasoning layer behind every call (the Agent SDK is used only for local runs and testing) |

## What it cost

| Item | Cost |
| --- | --- |
| Linear, Railway, Supabase | About $30 for the month |
| Obsidian, GitHub | Free |
| Claude subscription | Max, 20× tier. I think 5× would have been enough: the limit only bit on long overnight sessions, and on 5× that would have meant waiting a day or two for it to reset. Untested, so treat it as an estimate |
| Claude API (the app's reasoning) | Under $3 across the whole build. A week's advice costs about a penny to generate |

## What I learned

The practices and rules that came out of this build are written up in my playbook:

- [Best practices](https://github.com/stephenpollock79/stephenpollock79/blob/main/playbook/best-practices.md): what I'd recommend and what I'd avoid
- [My AI rules](https://github.com/stephenpollock79/stephenpollock79/blob/main/playbook/ai-rules.md): how I set up AI to act on its own and stop when it should

## What's next

A "builder mode" that walks chip → transfers → XI → armband in sequence, so each step accounts for the decisions made before it. The current pattern handles a straight swap well, but not coupled moves.

---

Built by [Stephen Pollock](https://github.com/stephenpollock79).
