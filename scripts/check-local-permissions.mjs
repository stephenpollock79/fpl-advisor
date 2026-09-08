#!/usr/bin/env node
// Fail if .claude/settings.local.json carries any permission rule.
//
// STE-82. The shared .claude/settings.json is committed and reviewable; the
// local file is per-machine, gitignored, and written by Claude Code itself
// whenever anyone answers "yes, and don't ask again". So it accumulates
// silently, and nobody reads a gitignored file.
//
// WHY "ANY RULE" AND NOT "ANY DANGEROUS RULE"
//
// A deny in the shared file cannot be overridden — verified, and it is what the
// documentation says. The ask list is the exposed one: on 8 September a local
// `Bash(gh pr *)` covered the shared `Bash(gh pr merge:*)` ask and two pull
// requests merged without the question reaching Stephen.
//
// That failure was not a dangerous-looking rule. `gh pr *` reads as convenience.
// It defeated a gate because it was BROADER than a gate, which is a relationship
// between two files rather than a property of one line — and the next one will
// be some other innocuous-looking prefix.
//
// So this check does not try to classify. Classification is exactly what failed:
// a list of suspicious shapes would have passed `gh pr *`, and would have to
// grow every time someone found a new phrasing. "Is it empty" is decidable and
// does not rot. See ADR 0011.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL = resolve(process.cwd(), '.claude/settings.local.json')
const RULE_KEYS = ['allow', 'ask', 'deny']

let raw
try {
  raw = readFileSync(LOCAL, 'utf8')
} catch (err) {
  // Absent is the target state, not a failure. ENOENT is the common path here.
  if (err.code === 'ENOENT') process.exit(0)
  throw err
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch {
  // Unparseable is reported rather than ignored: Claude Code would skip the bad
  // entries and keep the rest, so a broken file is not an inert one.
  console.error(`\n.claude/settings.local.json is not valid JSON.\n  ${LOCAL}\n`)
  process.exit(1)
}

const permissions = parsed.permissions ?? {}
const found = RULE_KEYS.flatMap((key) =>
  (permissions[key] ?? []).map((rule) => ({ key, rule })),
)

// additionalDirectories grants reach outside the working directory, so it counts
// as a permission rule even though it does not live under one of the three keys.
const extraDirs = permissions.additionalDirectories ?? []

if (found.length === 0 && extraDirs.length === 0) process.exit(0)

const lines = [
  '',
  '.claude/settings.local.json is granting permissions. It must stay empty.',
  '',
  `  ${LOCAL}`,
  '',
]

for (const { key, rule } of found) lines.push(`  ${key.padEnd(5)} ${rule}`)
for (const dir of extraDirs) lines.push(`  dir   ${dir}`)

lines.push(
  '',
  'This file is per-machine and gitignored, so nothing here was reviewed and',
  'nothing here shows up in a diff. A rule broader than one in the shared file',
  'silently covers it — that is how two PRs merged past a "gh pr merge" gate.',
  '',
  'To clear it:',
  '',
  '    echo \'{}\' > .claude/settings.local.json',
  '',
  'If one of the rules above is genuinely wanted, put it in the SHARED file,',
  '.claude/settings.json, where it is committed and can be argued with. Check',
  'first that it is not broader than an entry already in that file\'s ask list.',
  '',
  'ADR 0011 explains why this is a hard failure rather than a warning.',
  '',
)

console.error(lines.join('\n'))
process.exit(1)
