/**
 * The recommendation and conviction engine.
 *
 * Empty of logic on purpose: STE-30a scaffolds the boundary, not the engine.
 * Net, conviction and band arrive in their own slice, headless and unit-tested
 * before any UI consumes them.
 *
 * This package is framework-free by construction, not by convention. Its
 * tsconfig grants neither runtime's type surface (`lib: ES2022`, `types: []`),
 * so `window`, `document`, `process` and `fs` are compile errors here; and its
 * manifest declares no dependencies of any kind, which under pnpm makes an
 * undeclared import unresolvable rather than hoisted. Both levers are asserted
 * in tests/engine-package-boundary.test.ts. See ADR 0006.
 */

/** Placeholder identity, so both apps can prove they can import this package. */
export const ENGINE_PLACEHOLDER_VERSION = '0.0.0'

export function engineIdentity(): string {
  return `@fpl/engine@${ENGINE_PLACEHOLDER_VERSION}`
}
