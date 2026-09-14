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
  // The card shows a price, never its movement — a rise or a fall tonight is
  // the WATCH flag's business (STE-117), and the model has no source for it.
  /\bprice[- ](rise|rises|rising|drop|drops|fall|falls|change|changes|movement)\b/i,
  /\b(rise|rises|rising|drop|drops|fall|falls) in price\b/i,
  // ENGINE-AC-05: strength is not a probability, and no word may make it one.
  /\bchance\b/i,
  /\blikel/i,
  /\bprobab/i,
  /\bconfiden/i,
  /\bodds\b/i,
  /\bguarantee/i,
]

/**
 * **The recommendation is already decided before the model writes a word.**
 *
 * Code compares the two sides and the winning side *is* the recommendation
 * (ENGINE, *Which way the recommendation points*). The model's job is to explain
 * it. A line that argues against it leaves Select and Reject meaning nothing,
 * because the words underneath contradict the card they sit on.
 *
 * Found live on 2026-09-14: a captaincy call recommending Calvert-Lewin carried
 * the line *"Skip this one… the marginal xPts edge not worth it."* The figure
 * said one thing and the prose said the opposite, on the same card.
 */
const ARGUES_AGAINST: readonly RegExp[] = [
  /\bskip\b/i,
  /\bnot worth\b/i,
  /\bisn'?t worth\b/i,
  /\bstick with\b/i,
  /\bstay put\b/i,
  /\bhold off\b/i,
  /\bleave (it|him) (alone|as)\b/i,
  /\bno need to\b/i,
  /\bwouldn'?t bother\b/i,
]

/**
 * **A call that costs nothing may not be explained in money** (F4-AC-09,
 * F3-AC-28). A captaincy call and a substitution move no cash and use no
 * transfer, so a sentence about freeing up funds is not a weak argument — it is
 * a false one.
 *
 * Found live on 2026-09-14, and its cause was upstream: the model was being told
 * *"Change: X out, Y in"* on an armband call and reasonably concluded a player
 * was being sold. The prompt is fixed; this is the second line, because the next
 * way into the same mistake will not be the same way.
 */
const MONEY: readonly RegExp[] = [
  /\bfree(s|ing)? up\b/i,
  /£/,
  /\bbudget\b/i,
  /\bfunds?\b/i,
  /\bcheaper\b/i,
  /\bsavings?\b/i,
  /\bafford/i,
]

export type Reasoning = { text: string; source: 'model' | 'template' }

export type ReasoningRules = {
  /** No money moves on this call, so nothing in the line may claim any does. */
  costsNothing?: boolean
}

export const reasoningIsAcceptable = (text: string, rules: ReasoningRules = {}): boolean => {
  if (text.length === 0 || text.length > MAX_REASONING_CHARS) return false
  if (BLOCKLIST.some((pattern) => pattern.test(text))) return false
  if (ARGUES_AGAINST.some((pattern) => pattern.test(text))) return false
  if (rules.costsNothing === true && MONEY.some((pattern) => pattern.test(text))) return false
  return true
}

/** The model's line if it passes, otherwise the template. Never a retry. */
export function finalReasoning(
  modelText: string | null | undefined,
  rows: readonly EvaluationRow[],
  outName: string,
  inName: string,
  rules: ReasoningRules = {},
): Reasoning {
  const text = (modelText ?? '').trim()
  if (reasoningIsAcceptable(text, rules)) return { text, source: 'model' }
  return { text: templateReasoning(rows, outName, inName), source: 'template' }
}
