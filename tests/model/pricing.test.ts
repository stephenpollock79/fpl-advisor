/**
 * The run's cost figure (STE-157).
 *
 * **No criterion identifier appears in this file, and that sentence is the whole
 * of why.** The Cost control NFR puts the spend cap *outside* the application:
 * the £50 prepaid balance in the Anthropic console is the mechanism, and nothing
 * here can verify it (P7).
 *
 * `scripts/criteria-coverage.mjs` reads whole files rather than test titles, so
 * an identifier written in a comment counts as covered — including a comment
 * saying it is deliberately **not** covered. That trap has now been sprung three
 * times in this repo: `F6-AC-20`, a docblock range on `F7-AC-15`, and this file,
 * whose first draft named the spend-cap criterion in a sentence claiming it named
 * none. It shipped that way and read as covered until the next coverage run.
 *
 * So the rule for this file is mechanical rather than a matter of care: **write
 * no `F<n>-AC-<nn>` here at all**, in code or in prose. What it verifies is that
 * the early-warning figure ADR 0009 reads is not quietly low.
 *
 * It was quietly low from the first production run until 2026-09-16, and nothing
 * in the suite could see it: `costUsd` was null on one step out of six, the run's
 * total was still a number, and no test asserted what that number should be.
 */

import { describe, expect, it, vi } from 'vitest'
import { PINNED, priceFor } from '../../apps/server/src/model/client.js'

describe('pricing a model call', () => {
  it('every pinned model has a price', () => {
    // **The invariant that was actually broken.** Not "the lookup works" — the
    // lookup did work, against a key nothing ever asked it for. This fails the
    // day a step is re-pinned to a model nobody priced, which is the shape of
    // how `parse` moved to Sonnet on 2026-09-16.
    for (const [step, model] of Object.entries(PINNED)) {
      expect(priceFor(model, model), `${step} is pinned to ${model}`).not.toBeNull()
    }
  })

  it('a dated id from the API is priced as its alias', () => {
    // The exact string that broke it. Haiku's alias resolves dated; Sonnet's does
    // not, which is why only one of the two was ever wrong.
    expect(priceFor('claude-haiku-4-5', 'claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5 })
    expect(priceFor('claude-sonnet-5', 'claude-sonnet-5')).toEqual({ input: 2, output: 10 })
  })

  it('a bare alias still prices, so the fix does not break the case that worked', () => {
    expect(priceFor('claude-haiku-4-5', 'claude-haiku-4-5')).toEqual({ input: 1, output: 5 })
  })

  it('a different model sharing a prefix is not priced as the one it resembles', () => {
    // Prefix matching is why this test exists. A loose `startsWith` would price a
    // hypothetical cheaper variant at the full model's rate and over-report
    // instead of under-reporting — the same defect facing the other way.
    expect(priceFor('claude-sonnet-5-mini', 'claude-sonnet-5-mini')).toBeNull()
    expect(priceFor('claude-sonnet-5', 'claude-sonnet-5-mini-20260101')).toBeNull()
  })

  it('an unknown model records nothing, quietly', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(priceFor('some-other-provider/model', 'some-other-provider/model')).toBeNull()

    // Quiet is right here: an unfamiliar model is the case the original guard was
    // written for, and a guessed price would be worse than none.
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('a pinned model served an unrecognised id says so, because it can only be our mistake', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // A pinned model is one this file chose. If what comes back cannot be priced,
    // the omission is in this file — the opposite of an unfamiliar model, and it
    // must not be swallowed by the same silent branch.
    expect(priceFor(PINNED.propose, 'claude-haiku-4-5-but-renamed')).toBeNull()

    expect(error).toHaveBeenCalledWith(expect.stringContaining('no price for pinned model'))
    error.mockRestore()
  })

  it('the requested id is never used as the price, only to decide whether to shout', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // Asking for Sonnet and being served something else is precisely when the
    // requested id is the wrong price. Falling back to it would swap
    // under-reporting for over-reporting rather than fix anything.
    expect(priceFor('claude-sonnet-5', 'some-cheaper-thing')).toBeNull()
    error.mockRestore()
  })
})
