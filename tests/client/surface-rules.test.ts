/**
 * Two rules about what the screens may do, checked on the source rather than
 * trusted (STE-62's hand-forward from slice 4).
 *
 * **ENGINE-AC-04, second half.** Every surface displaying net, conviction or band
 * reads the engine's output rather than recomputing it. So no component imports
 * the engine's arithmetic: components receive values from `calls/`, which takes
 * them from the run or from `evaluateCall`. A component that recomputed a band
 * from a stored conviction would pass every engine test while producing exactly
 * the disagreement between two screens the rule forbids.
 *
 * **ENGINE-AC-05.** Conviction is the strength of the call, never a probability,
 * likelihood or chance of being right. There is no calibration and no backtest
 * behind it. So no string the Assistant can show uses that vocabulary.
 *
 * Both scans fail until the Assistant screen exists: a scan over no files passes
 * by construction and proves nothing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT = fileURLToPath(new URL('../../apps/client/src', import.meta.url))

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })

const screens = filesUnder(join(CLIENT, 'screens'))
const assistant = screens.filter((f) => f.includes(`${join('screens', 'Assistant')}`))

describe('ENGINE-AC-04, ENGINE-AC-05 · what the screens may do', () => {
  it('ENGINE-AC-04: the Assistant screen exists, so the scans below read something', () => {
    expect(assistant.length).toBeGreaterThanOrEqual(3)
  })

  it('ENGINE-AC-04: no component imports engine arithmetic — only types, and values from calls/', () => {
    const offenders = screens.filter((file) => {
      const source = readFileSync(file, 'utf8')
      // A value import from the engine, of any name. `import type` is allowed.
      return /import\s+(?!type\b)[^;]*from\s+['"]@fpl\/engine['"]/.test(source)
    })
    expect(offenders.map((f) => f.replace(CLIENT, 'apps/client/src'))).toEqual([])
  })

  it('ENGINE-AC-05: no string the Assistant shows calls conviction a probability, likelihood, chance or confidence', () => {
    const banned = /\b(probab\w*|likel\w*|likelihood|confiden\w*|odds|chance of being)\b/i
    const offenders: string[] = []
    for (const file of [...assistant, ...filesUnder(join(CLIENT, 'calls'))]) {
      const source = readFileSync(file, 'utf8')
      // String literals and JSX text only — never identifiers or comments.
      const texts = [
        ...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g),
        ...source.matchAll(/>([^<>{}\n]+)</g),
      ].map((m) => m.slice(1).find((g) => g !== undefined) ?? '')
      for (const text of texts) if (banned.test(text)) offenders.push(`${file.replace(CLIENT, '')}: ${text}`)
    }
    expect(offenders).toEqual([])
  })
})
