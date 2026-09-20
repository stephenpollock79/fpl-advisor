/**
 * **ENGINE-AC-04's other half** (STE-176).
 *
 * The criterion has two: one function produces net, conviction and band, and
 * *every surface displaying any of the three reads that output rather than
 * recomputing it.* `tests/engine/worked-example.test.ts` proves the first — the
 * three figures come out of one `evaluateCall` and agree with each other — and
 * cannot prove the second.
 *
 * **A component that derived a band from a stored conviction would pass every
 * test in the engine suite** while producing exactly the disagreement between
 * two screens the rule forbids. It is an architecture invariant in `CLAUDE.md`,
 * not a preference: *"Never compute conviction, net or a band inside a
 * component."*
 *
 * So this asserts the structure rather than trusting it, in the same shape as
 * `tests/engine-package-boundary.test.ts`. `apps/client/src/calls/` is the one
 * place figures are allowed to come from, taking them from the run or from
 * `evaluateCall`; nothing under `screens/` may do arithmetic on the three.
 *
 * **It reads the syntax tree, not the text.** A regular expression over source
 * matches the word `net` inside `network`, inside a comment and inside a
 * string, and misses `figures['net'] * 2`. The compiler already knows which
 * `net` is a value and which is prose.
 *
 * **What counts as arithmetic here:** `+ - * / %` and `++ --` with a figure on
 * either side. Reading a figure, formatting it, comparing it, passing it on and
 * putting it in a template are all untouched — the rule is about deriving a
 * number, not about handling one.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SCREENS = fileURLToPath(new URL('../../apps/client/src/screens/', import.meta.url))

/** The three the criterion names, and the stored previous one a band move reads. */
const FIGURES = new Set(['net', 'conviction', 'previousConviction', 'band'])

const ARITHMETIC = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
])

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })

/**
 * Does this expression name one of the three? `net`, `figures.net`,
 * `call.previousConviction`, `figures['conviction']` — the shapes a component
 * would actually reach a figure through.
 */
const namesFigure = (node: ts.Node): boolean => {
  if (ts.isIdentifier(node)) return FIGURES.has(node.text)
  if (ts.isPropertyAccessExpression(node)) return FIGURES.has(node.name.text)
  if (ts.isElementAccessExpression(node)) {
    const arg = node.argumentExpression
    return ts.isStringLiteral(arg) && FIGURES.has(arg.text)
  }
  if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) return namesFigure(node.expression)
  return false
}

type Finding = { file: string; line: number; text: string }

const findings: Finding[] = []

for (const file of sourceFiles(SCREENS)) {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)

  const record = (node: ts.Node): void => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    findings.push({ file: file.slice(SCREENS.length), line: line + 1, text: node.getText(sf).slice(0, 90) })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && ARITHMETIC.has(node.operatorToken.kind)) {
      if (namesFigure(node.left) || namesFigure(node.right)) record(node)
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && namesFigure(node.operand)) {
      if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) record(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

describe('ENGINE-AC-04 · no screen computes a figure it was given', () => {
  it('reads every screen, or it is asserting nothing', () => {
    // Without this the suite goes green the day the directory moves, and a pass
    // would mean "nothing was looked at" rather than "nothing was found".
    expect(sourceFiles(SCREENS).length).toBeGreaterThan(5)
  })

  it('ENGINE-AC-04: no component under screens/ does arithmetic on net, conviction or band', () => {
    expect(
      findings,
      'A screen deriving one of these would disagree with another screen showing the same call, ' +
        'and every engine test would still pass. Figures come from the run or from evaluateCall, ' +
        'through apps/client/src/calls/ — never from arithmetic in a component (CLAUDE.md).',
    ).toEqual([])
  })
})
