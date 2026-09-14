# The Gaffer

A personal decision-support app for Fantasy Premier League. Before each weekly deadline it issues a short list of **calls** — transfers, substitutions, captain and vice — each with a conviction percentage, the projected points it gains or costs, and the reasoning behind it.

Built solo in three weeks (31 Aug – 16 Sep 2026) during a self-directed sabbatical in AI-assisted product development. I'm a product manager: I directed this build rather than hand-wrote it.

## Demo Video

https://github.com/user-attachments/assets/12038f10-a138-49e8-9d00-0acf82a0a862<img width="468" height="50" alt="image" src="https://github.com/user-attachments/assets/e8ead556-a446-4e71-b754-cc5e78d67785" />

## Why there's no public link

The app runs on a Claude API licence, so every recommendation carries a real usage cost. Access is restricted to me for that reason. The video above is the demo.

## What it does

Reads my real squad from FPL's public feed — corrected by uploaded screenshots when I've changed something since the last deadline — and combines it with fixtures, injury news and a bought-in projection feed to issue the week's calls.

## How it was built

**Process.** Problem brief → clickable prototype and design system → PRD and architecture decision records → sliced into tickets → built in daily slices, each one cold-reviewed by a separate agent before it was called done.

**Tools.**

| Tool | Used for |
| --- | --- |
| Claude Code | the build itself, locally against GitHub |
| Claude Cowork | PRD, planning and decision records |
| Claude Design | prototype, screen flow and design system |
| Linear | tickets, slices and milestones |
| GitHub | source, PRs, pre-commit hooks |
| Railway | deploy |
| Supabase | Postgres and Auth |
| Anthropic Agent SDK | the reasoning layer |

## What's next

A "builder mode" that walks chip → transfers → XI → armband in sequence, so each step accounts for the decisions made before it — the current pattern handles a straight swap well, but not coupled moves.
