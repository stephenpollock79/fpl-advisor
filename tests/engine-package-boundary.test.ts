import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// This test lives at the workspace root rather than inside packages/engine on
// purpose: reading a manifest needs node:fs, and the engine's own tsconfig
// grants it no Node types. The test that constrains the package cannot live
// inside the constraint it enforces.
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const manifest = JSON.parse(read('../packages/engine/package.json')) as Record<string, unknown>
const tsconfig = JSON.parse(read('../packages/engine/tsconfig.json')) as {
  compilerOptions: { lib: string[]; types: string[] }
}

describe('engine package boundary', () => {
  it('declares no dependencies', () => {
    expect(manifest['dependencies'] ?? {}).toEqual({})
  })

  it('declares no devDependencies', () => {
    expect(manifest['devDependencies'] ?? {}).toEqual({})
  })

  it('declares no peerDependencies', () => {
    expect(manifest['peerDependencies'] ?? {}).toEqual({})
  })

  it('grants itself no DOM type surface', () => {
    expect(tsconfig.compilerOptions.lib).toEqual(['ES2022'])
  })

  it('grants itself no ambient Node type surface', () => {
    expect(tsconfig.compilerOptions.types).toEqual([])
  })
})
