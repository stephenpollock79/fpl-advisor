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

// F7-AC-01, F6-RS-08, F3-UP-04. The suffix set is closed: AC (acceptance),
// UP (unhappy path), RS (refresh re-scoring, F6 only).
const IDENTIFIER = /\bF\d-(?:AC|UP|RS)-\d{2}\b/g

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
    const declaration = line.match(/^\|\s*\*\*(F\d-(?:AC|UP|RS)-\d{2})\*\*\s*\|/)
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
    const row = line.match(/^\|\s*(F\d-(?:AC|UP|RS)-\d{2})\s*\|/)
    if (row) claim(row[1], 'docs/manual-coverage.md')
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
