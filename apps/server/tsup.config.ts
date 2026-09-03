import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  // The engine is consumed as TypeScript source (ADR 0006, D2), so it is
  // bundled rather than resolved at runtime. There is no build artifact
  // between the engine and its consumers to go stale.
  noExternal: ['@fpl/engine'],
  clean: true,
})
