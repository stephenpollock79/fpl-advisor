/**
 * The editorial's second line of defence (F8-AC-08), and what runs when the
 * model has nothing usable to say.
 *
 * Same shape as `reasoning.ts` and for the same reason: the first line is
 * construction — the call is given only what the Overview shows — and this is
 * the deterministic catch behind it. A paragraph that fails is replaced by a
 * templated one built from the calls themselves, **never retried**, because a
 * retry is a second charge for the same sentence.
 *
 * **It carries ENGINE-AC-05 too.** The strength figure is not a chance, a
 * likelihood or a confidence, and the editorial is the one place on the Overview
 * where the words are the model's.
 */

import type { EditorialInput } from './client.js'

/** A paragraph, not an essay. The five-line clamp is the card's; this is the text's. */
export const MAX_EDITORIAL_CHARS = 700

/**
 * Reading the strength figure as a probability, and the two shapes of hedge the
 * Voice constraint forbids outright. Matched as words, case-insensitive.
 */
const BLOCKLIST: readonly RegExp[] = [
  /\bprobab\w*/i,
  /\blikel\w*/i,
  /\bconfiden\w*/i,
  /\bodds\b/i,
  /\bchance of being\b/i,
  // Structure the card cannot render: it is a paragraph with a five-line clamp.
  /^\s*[-*•]\s/m,
  /^#{1,6}\s/m,
]

export const editorialIsAcceptable = (text: string): boolean => {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_EDITORIAL_CHARS) return false
  return !BLOCKLIST.some((pattern) => pattern.test(trimmed))
}

/**
 * What the card says when the model's paragraph is unusable or was never
 * written — a run before today, a failed call, the mock route.
 *
 * **Stated, never blank.** `F8-AC-01` says the editorial states four things
 * always and that a quiet week is stated rather than left empty; an absent
 * paragraph must not turn the card into a hole.
 */
export function templateEditorial(input: EditorialInput): string {
  if (input.calls.length === 0) {
    return 'Nothing in your fifteen is worth changing this week. That is a decision, not an empty screen — hold what you have.'
  }

  const forced = input.calls.filter((c) => c.forced).length
  const best = [...input.calls].sort((a, b) => b.net - a.net)[0]
  const opening =
    forced > 0
      ? `${String(forced)} of this week's ${String(input.calls.length)} calls are forced, so start there.`
      : `${String(input.calls.length)} call${input.calls.length === 1 ? '' : 's'} to weigh this week, none of them forced.`

  return best
    ? `${opening} The biggest gain on the table is ${best.title}, at ${best.net >= 0 ? '+' : '−'}${Math.abs(best.net).toFixed(2)} projected points.`
    : opening
}

/** The paragraph the card shows, and where it came from. */
export function finalEditorial(text: string, input: EditorialInput): { text: string; source: 'model' | 'template' } {
  return editorialIsAcceptable(text)
    ? { text: text.trim(), source: 'model' }
    : { text: templateEditorial(input), source: 'template' }
}
