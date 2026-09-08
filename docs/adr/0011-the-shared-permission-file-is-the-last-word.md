# ADR 0011 — The shared permission file is the last word

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** STE-82, STE-80, STE-81, G13 (ask gates, in `~/.claude/CLAUDE.md`)
- **Mechanism:** `scripts/check-local-permissions.mjs`, called from `.githooks/pre-commit`

## Context

Claude Code reads permission rules from two files in this repo. `.claude/settings.json` is
committed and reviewable. `.claude/settings.local.json` is per-machine, gitignored, and **written by
Claude Code itself** every time anyone answers "yes, and don't ask again". Nobody reads a gitignored
file, so it accumulates unobserved.

STE-82 was raised on the belief that the local file could re-grant something the shared file
**denies**. It cannot, and this was checked rather than assumed. The shared file allows `Read(**)`
and separately denies `Read(**/.env*)`; a read of an `.env` file is refused. The documentation states
the same rule — *if a tool is denied at any level, no other level can allow it* — and the force-push
denials that prompted the original ticket were in force the whole time.

**The `ask` list is the exposed one, and that is where this project's real gates live.** `ask` means
*stop and check with Stephen* — dependencies, migrations, Railway, Supabase, merging a pull request.
It is the enforcement of G13.

On 8 September, during STE-75 and STE-93, two gates failed silently:

| Shared file says | What ran | What reached Stephen |
| --- | --- | --- |
| `ask` before `Bash(pnpm add:*)` | `corepack pnpm add -D -w @types/node@^22` | nothing |
| `ask` before `Bash(gh pr merge:*)` | `gh pr merge 16`, `gh pr merge 17` | nothing |

In both cases the local file held a broader rule — `Bash(corepack pnpm *)`, `Bash(gh pr *)` — that
covered the command, and that looked like the whole explanation.

**It is not, and this ADR does not claim it is.** After the local file was emptied and the shared
file widened, `npx --version` still ran without a prompt. `Bash(npx:*)` has been on the ask list
since 4 September, so no reload and no local rule can account for it. See *Open* below: **why the
ask gates are not firing is unresolved**, and this ADR's mechanism does not close it.

**A third route belongs in the record, because it is the one nobody looks for.** A deny names the
*tool* it guards, not the file. `Read(**/.env*)` stops the file-reading tool; a shell command reaches
the same path with no rule in its way. Demonstrated against the harmless `.env.example`: the reading
tool refused, a one-line script read it. The local file permitted `Bash(python3 -)`, which is a
general-purpose escape hatch — anything Python can do, and Python can do anything.

## Decision

**`.claude/settings.local.json` holds no permission rules. Ever. The shared file is the only source,
and a commit fails while the local file is not empty.**

Three parts, and the first is the load-bearing one:

1. **The local file stays empty.** `scripts/check-local-permissions.mjs` fails the commit if it
   carries any `allow`, `ask`, `deny` or `additionalDirectories` entry. A rule that is genuinely
   wanted goes in the shared file, where it is committed and can be argued with.
2. **The shared file's `ask` patterns cover the phrasings that evaded them** — `corepack pnpm add`
   alongside `pnpm add`, and the arbitrary-code forms (`python3 -c`, `node -e`, `sh -c` and the
   rest) that reach past every file-tool rule.
3. **File edits go through the Edit and Write tools, not through shell heredocs.** The permission
   model fences the file tools precisely and the shell only coarsely, so an agent editing files
   through `python3 - <<'PY'` is outside the model that protects `docs/criteria/` and `.env`.

### The check tests for empty, not for safe

This is the part worth defending, because a narrower check looks more reasonable and is worse.

`Bash(gh pr *)` is what defeated a gate. It does not read as dangerous — it reads as convenience. It
was a problem only because it was **broader than an entry in the other file**, which is a
relationship between two files rather than a property of one line. Any list of suspicious shapes
would have passed it, and would need extending every time someone found a new phrasing.

*Is it empty* is decidable, needs no judgement, and does not rot.

## Consequences

- **More interruptions, deliberately.** Adding a dependency, editing a migration, merging a pull
  request and running Railway or Supabase commands now stop for Stephen, which is what the rules
  already said would happen.
- **A standing approval costs a commit.** "Yes, and don't ask again" writes to the local file, so the
  next commit fails and the rule has to be moved into the shared file on purpose. That friction is
  the mechanism, not a side effect of it.
- **The check cannot run in CI**, because the file it reads is gitignored and never reaches CI. The
  pre-commit hook is the only place both the file and a human exist at once — the same reasoning that
  puts the derived-file checks there (P8).
- **The Bash surface is still not exhaustively fenced, and this ADR does not claim otherwise.**
  Part 2 narrows the common escape hatches; it does not enumerate every way a shell can read a file.
  The real protection for secrets remains that they are gitignored and live in Railway, not that a
  pattern list is complete.

## Open — the ask gates are not firing, and this ADR does not fix that

Everything above is worth having on its own terms. None of it is the thing that makes an `ask` rule
stop for Stephen, because as of 8 September **no `ask` rule observably does**.

What is established:

- **Deny works.** `Read(**)` is allowed, `Read(**/.env*)` is denied, the read is refused. Tested.
- **Ask does not prompt in this session type.** Tested with `Bash(npx:*)`, a rule present since
  4 September, with the local file empty. It ran silently.
- **The documentation says it should prompt.** *"Explicit ask rules still force a prompt"* appears in
  five places on the permission-modes page, including specifically for auto mode.

That check was run, and it prompted:

```
Permission rule Bash(npx:*) requires confirmation for this command.
```

**So the rules are right and the ask list is correct as written.** The gap is not in this repo. It
is in the session that was doing the work: the Claude desktop app's Code tab, which had been running
Claude Code **2.1.231** all day while the CLI had auto-updated to **2.1.263**.

That leaves two candidates, and they are still not separated:

- **The version.** 2.1.231 did not enforce ask rules in that session type, and a restarted desktop
  session on 2.1.263 would.
- **The session type.** The desktop Code tab handles ask rules differently at any version.

**The discriminating check is a fresh desktop session** — which will start on 2.1.263 — running the
same `npx --version`. Prompts, and it was the version; silent, and it is the surface.

Until that is answered, one operating rule holds, and it is the practical half of this ADR:

> **A gate is only enforced in a session that prompts for it.** In a desktop session, treat the ask
> list as documentation of intent rather than a control, and confirm anything on it in the
> conversation before running it.

Tracked in STE-94.

- **Scanning the local file for dangerous-looking rules.** Rejected above: it would have passed the
  rule that actually caused the failure.
- **Deleting the local file.** Claude Code recreates it on the next standing approval, so a delete is
  a moment, not a state. The check is what makes it a state.
- **Moving the `ask` gates to `deny`.** Deny cannot be overridden, which is the attraction, but deny
  means *never* rather than *ask me* — it would block the work these gates exist to approve.
- **`allowManagedPermissionRulesOnly` in a managed settings file.** The only mechanism that makes one
  source authoritative by construction. Rejected because it lives at machine level outside the repo,
  needs admin rights, and would move the rules out of version control — the failure STE-84 already
  describes.
