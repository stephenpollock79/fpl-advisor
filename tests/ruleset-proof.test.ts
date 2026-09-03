import { describe, expect, it } from "vitest";

// Throwaway. Exists only to prove the `Main Protection` ruleset blocks a merge
// when CI is red (STE-76). Delete this branch once the merge button is confirmed
// disabled — it must never reach main.
describe("STE-76 ruleset proof", () => {
  it("fails on purpose", () => {
    expect(true).toBe(false);
  });
});
