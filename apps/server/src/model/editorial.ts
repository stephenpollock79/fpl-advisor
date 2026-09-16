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
  /**
   * **Nothing about fitness, because nothing about fitness is ever given**
   * (STE-146, made a mechanism 2026-09-16 on STE-148).
   *
   * The editorial receives a title, a kind, a net, a band and sometimes a
   * reason. It has no availability data, no news, no minutes. Asked to explain a
   * call worth +0.00 on a *thin* band it invented one: *"Injury forces
   * Calvert-Lewin out"*, about a fit player it recommended for the captaincy two
   * clauses later.
   *
   * **The instruction forbidding that is a convention; this is the mechanism.**
   * A paragraph reaching for a cause it cannot know is replaced by the template
   * rather than shown, the same way a card's reasoning line already is.
   */
  /\binjur\w*/i,
  /\bdoubtful\b/i,
  /\bunavailable\b/i,
  /\bsuspend\w*|\bsuspension\b/i,
  /\bfit(ness)?\b/i,
  /\brotat\w*/i,
  /\bminutes\b/i,
  /\bknock\b/i,
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

  /**
   * **The fallback obeys every rule the model obeys** (STE-148).
   *
   * It did not, and that is how the complaint that opened STE-142 survived its
   * own fix. This read *"1 of this week's 4 calls are forced, so start there"* —
   * the exact sentence on Stephen's screen at 01:58 — and the fix removed the
   * count from the **prompt**, never touching the template that was actually
   * writing it. A rule applied to the model and not to the code standing in for
   * it is not a rule; it is a rule with a hole the shape of its fallback.
   *
   * So: **no counts** (a number in frozen prose cannot follow the data,
   * STE-142), **name what it points at** (STE-144), and **never point at a call
   * that is only real if another is taken first** — which is why the forced call
   * is described rather than made the starting place.
   */
  const best = [...input.calls].sort((a, b) => b.net - a.net)[0]
  const forced = input.calls.find((c) => c.forced)

  if (forced) {
    return `${forced.title} is forced — ${forced.kind}, and not a choice. ${
      best && best.title !== forced.title
        ? `The biggest gain elsewhere is ${best.title}.`
        : 'The rest of the week is yours to weigh.'
    }`
  }

  return best
    ? `The biggest gain on the table is ${best.title} — ${best.kind}, at ${best.net >= 0 ? '+' : '−'}${Math.abs(best.net).toFixed(2)} projected points. The rest are worth weighing against it.`
    : 'Nothing this week stands out. Weigh what is there and hold the rest.'
}

/** The paragraph the card shows, and where it came from. */
export function finalEditorial(text: string, input: EditorialInput): { text: string; source: 'model' | 'template' } {
  return editorialIsAcceptable(text)
    ? { text: text.trim(), source: 'model' }
    : { text: templateEditorial(input), source: 'template' }
}
