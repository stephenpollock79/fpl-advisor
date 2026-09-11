/**
 * The second line of the reasoning rule (ENGINE step 3, F3-AC-22).
 *
 * The first line is construction: the reasoning call is given only the values
 * the card's table shows, so citing anything else is inventing it. This is the
 * catch behind that — a deterministic check, not a second model call — and a
 * line that fails it is replaced by the template built from the table's own
 * winning rows, never retried.
 *
 * It also holds ENGINE-AC-05 on the one surface where words are the model's:
 * the strength figure is never a chance, a likelihood or a confidence.
 */

import { type EvaluationRow, templateReasoning } from '@fpl/engine'

/** Four lines on a 390-wide card, at the card's reasoning size. */
export const MAX_REASONING_CHARS = 180

/**
 * Vocabulary for fields the card does not show, and for reading the strength
 * figure as a probability. Matched as words, case-insensitive.
 */
const BLOCKLIST: readonly RegExp[] = [
  // Evidence the model may have seen proposing, and the card does not show.
  /\bnews\b/i,
  /\bpress\b/i,
  /\bconference\b/i,
  /\brotat/i,
  /\bminutes\b/i,
  /\bgoals?\b/i,
  /\bassists?\b/i,
  /\bclean[- ]?sheets?\b/i,
  /\bx[GA]\b/,
  /\bexpected goals\b/i,
  /\bpenalt/i,
  /\bset[- ]pieces?\b/i,
  /\blineups?\b/i,
  /\bpundit/i,
  /\brumou?r/i,
  // ENGINE-AC-05: strength is not a probability, and no word may make it one.
  /\bchance\b/i,
  /\blikel/i,
  /\bprobab/i,
  /\bconfiden/i,
  /\bodds\b/i,
  /\bguarantee/i,
]

export type Reasoning = { text: string; source: 'model' | 'template' }

export const reasoningIsAcceptable = (text: string): boolean =>
  text.length > 0 && text.length <= MAX_REASONING_CHARS && !BLOCKLIST.some((pattern) => pattern.test(text))

/** The model's line if it passes, otherwise the template. Never a retry. */
export function finalReasoning(
  modelText: string | null | undefined,
  rows: readonly EvaluationRow[],
  outName: string,
  inName: string,
): Reasoning {
  const text = (modelText ?? '').trim()
  if (reasoningIsAcceptable(text)) return { text, source: 'model' }
  return { text: templateReasoning(rows, outName, inName), source: 'template' }
}
