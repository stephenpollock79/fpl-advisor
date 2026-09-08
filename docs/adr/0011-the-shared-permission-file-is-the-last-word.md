# ADR 0011 — The shared permission file is the last word

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** STE-82, STE-80, STE-81, G13 (ask gates, in the general contract)
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

**It is not, and this ADR does not claim it is.** The real cause was the session: the desktop app was
running Claude Code 2.1.231, which did not enforce `ask` rules at all. Nothing in this repo was
broken. That is traced in full below, because the wrong explanation was the more convincing one and
is worth being able to recognise again.

**So the mechanism in this ADR does not close the gap those two failures came through** — a version
upgrade did. It closes a different one, which is real and remains: the local file accumulating rules
that nobody reviews.

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

## Why the ask gates appeared not to fire — resolved, STE-94

Everything above is worth having on its own terms, but none of it was what made the two gates fail.
Finding that out took three checks, and the order matters because the first two both pointed at the
wrong culprit.

**Check one — is it the local file?** No. With the local file emptied and the shared file widened,
`npx --version` still ran with no prompt, and `Bash(npx:*)` had been on the ask list since
4 September. Neither a stale reload nor a local rule could account for it. Meanwhile `deny` was
verified working throughout: `Read(**)` is allowed, `Read(**/.env*)` is denied, the read is refused.

This is where the original diagnosis broke. The local file *did* hold broader rules covering both
commands, which is a complete-looking explanation and a wrong one — the documentation says an
explicit ask rule forces a prompt even in auto mode, in five separate places on the permission-modes
page, so the silence needed explaining rather than rationalising.

**Check two — is it Claude Code, or this session?** A plain CLI session prompted immediately:

```
Permission rule Bash(npx:*) requires confirmation for this command.
```

So the rules were right and the gap was not in this repo. It was the session doing the work: the
Claude desktop app's Code tab, running Claude Code **2.1.231** while the CLI had auto-updated to
**2.1.263**.

**Check three — the version, or the surface?**

A fresh desktop session, started after quitting the app so it loads 2.1.263, separates them. It
prompted:

```
Allow Claude to run Check npx version?
  npx --version
[Deny]  [Allow once]
```

**It was the version.** 2.1.231 did not enforce `ask` rules in a desktop session; 2.1.263 does. The
rules, the shared file and this project's configuration were correct throughout.

Two details from that prompt are worth keeping, because they are the difference between the two
versions and not incidental to it:

- **The dialog offers only *Deny* and *Allow once*.** There is no "don't ask again", so a desktop
  prompt cannot write a rule into `.claude/settings.local.json` at all. The CLI's third option can.
- **The local file stayed empty across that session.** On 2.1.231 it had refilled within fifteen
  minutes, twice, with rules nobody was shown — most tellingly `Bash(node
  scripts/check-local-permissions.mjs)`, the check granting itself an exemption.

So the accumulation this ADR guards against was, on the older version, both silent and fast. It is
neither on the current one — which lowers the frequency the check has to catch, and does not change
the case for it, since the CLI still offers the option that writes the file.

### The rule that outlives the bug

> **A gate is only enforced in a session that prompts for it.**

Keep this. It was written for a version mismatch that is now fixed, but the fault it names is
general: the ask list is a claim about what will happen, and only the running session decides
whether it does. A session pinned to an old build, a surface that has not caught up, or a mode that
adjudicates differently all produce the same silence, and none of them announce themselves.

A session that has not shown a permission prompt is not evidence that nothing needed one.

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
