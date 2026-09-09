#!/usr/bin/env node
// Answers one question as a command rather than an audit: which acceptance
// criteria have nothing verifying them?
//
// The mechanism is ADR 0010 — every automated test names the criteria it
// covers in its own title, and every human-checklist or eval criterion is
// recorded by hand in docs/manual-coverage.md. This script reads the criteria
// files for the full set of identifiers, reads both of those sources for what
// is claimed, and reports the difference.
//
// It reports. It does not gate: on the day it was written 236 of 236 criteria
// were uncovered, which is a true fact about a build that has not started, not
// a commit to reject. Wiring it into .githooks/pre-commit is a decision for
// after the MVP, not before it.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CRITERIA_DIR = join(ROOT, 'docs/criteria')
const MANUAL_REGISTER = join(ROOT, 'docs/manual-coverage.md')

// F7-AC-01, F6-RS-08, F3-UP-04, ENGINE-AC-02. The suffix set is closed: AC
// (acceptance), UP (unhappy path), RS (refresh re-scoring, F6 only).
//
// **ENGINE has no number because it is not a feature.** It governs F3 and F4 and
// is built as its own slice, so there was no prefix its criteria could take —
// which is why `ENGINE.criteria.md` carried zero identifiers and the highest-risk
// slice in the build had nothing a ticket could cite. An invented `ENGINE-AC-01`
// under the old pattern matched nothing and would have been silently invisible,
// creating no coverage while looking exactly like coverage.
//
// The three patterns below are built from one prefix on purpose. They were three
// separate copies of the same shape, which is how one gets widened and the other
// two quietly keep rejecting what it now accepts.
const PREFIX = String.raw`(?:F\d|ENGINE)`
const BODY = String.raw`-(?:AC|UP|RS)-\d{2}`
const IDENTIFIER = new RegExp(String.raw`\b${PREFIX}${BODY}\b`, 'g')
const DECLARATION = new RegExp(String.raw`^\|\s*\*\*(${PREFIX}${BODY})\*\*\s*\|`)
const REGISTER_ROW = new RegExp(String.raw`^\|\s*(${PREFIX}${BODY})\s*\|`)

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const identifiersIn = (path) => readFileSync(path, 'utf8').match(IDENTIFIER) ?? []

// --- The full set, from the derived criteria files -------------------------
const declared = new Map() // identifier -> source file
for (const file of readdirSync(CRITERIA_DIR).filter((f) => f.endsWith('.criteria.md')).sort()) {
  // Only the first column of the criteria table declares an identifier; a
  // cross-reference in prose ("see F6-AC-05") must not invent one.
  const path = join(CRITERIA_DIR, file)
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const declaration = line.match(DECLARATION)
    if (declaration) declared.set(declaration[1], file)
  }
}

// --- What claims to cover them ---------------------------------------------
const claims = new Map() // identifier -> [where]
const claim = (id, where) => claims.set(id, [...(claims.get(id) ?? []), where])

const testFiles = walk(ROOT).filter((p) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(p))
for (const path of testFiles) {
  for (const id of new Set(identifiersIn(path))) claim(id, relative(ROOT, path))
}
try {
  // Only the first cell of a table row counts, exactly as in the criteria files.
  // Prose in this file must never register coverage: a sentence explaining that a
  // criterion CANNOT be checked here reads to a naive grep as a claim that it has
  // been. That is not hypothetical — it happened, and moved F7 from 2 to 5.
  for (const line of readFileSync(MANUAL_REGISTER, 'utf8').split('\n')) {
    const row = line.match(REGISTER_ROW)
    if (row) {
      claim(row[1], 'docs/manual-coverage.md')
      continue
    }

    // A row that names identifiers but does not put exactly one in the first cell
    // is skipped — and used to be skipped in silence, which is worse than being
    // absent. Five rows were written on 2026-09-09 naming two to four criteria
    // each; every one counted for nothing and the report looked identical.
    if (/^\|/.test(line) && IDENTIFIER.test(line)) {
      IDENTIFIER.lastIndex = 0
      console.warn(
        `! docs/manual-coverage.md: this row names criteria but is not counted — ` +
          `the first cell must hold exactly one identifier.\n  ${line.trim().slice(0, 100)}\n`,
      )
    }
    IDENTIFIER.lastIndex = 0
  }
} catch {
  console.warn('! docs/manual-coverage.md is missing — human-checklist coverage cannot be counted.\n')
}

// --- Report -----------------------------------------------------------------
const byFile = new Map()
for (const [id, file] of declared) byFile.set(file, [...(byFile.get(file) ?? []), id])

let uncoveredTotal = 0
console.log(`Criteria coverage — ${declared.size} criteria, ${testFiles.length} test files\n`)
for (const [file, ids] of [...byFile].sort()) {
  const uncovered = ids.filter((id) => !claims.has(id)).sort()
  uncoveredTotal += uncovered.length
  const label = `${file.replace('.criteria.md', '').padEnd(6)} ${String(ids.length - uncovered.length).padStart(3)}/${String(ids.length).padEnd(3)} covered`
  console.log(uncovered.length ? `${label}  uncovered: ${uncovered.join(' ')}` : `${label}`)
}

// A claim on an identifier no criteria file declares is a typo in a test name,
// and silently ignoring it would make the covered count a lie.
const unknown = [...claims.keys()].filter((id) => !declared.has(id)).sort()
if (unknown.length) {
  console.log(`\n! ${unknown.length} identifier(s) named in tests but declared nowhere in docs/criteria:`)
  for (const id of unknown) console.log(`    ${id} — ${claims.get(id).join(', ')}`)
}

console.log(`\n${declared.size - uncoveredTotal} of ${declared.size} covered · ${uncoveredTotal} uncovered`)
if (unknown.length) process.exitCode = 1
