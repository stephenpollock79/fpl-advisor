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

import { type EditorialInput, pairOf } from './client.js'

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
    return `${pairOf(forced)} is forced — ${forced.kind}, and not a choice. ${
      best && pairOf(best) !== pairOf(forced)
        ? `The biggest gain elsewhere is ${pairOf(best)}.`
        : 'The rest of the week is yours to weigh.'
    }`
  }

  return best
    ? `The biggest gain on the table is ${pairOf(best)} — ${best.kind}, at ${best.net >= 0 ? '+' : '−'}${Math.abs(best.net).toFixed(2)} projected points. The rest are worth weighing against it.`
    : 'Nothing this week stands out. Weigh what is there and hold the rest.'
}


/**
 * Does the paragraph describe the calls it was given? (STE-184)
 *
 * **The blocklist above cannot answer this, and that is why this exists.** That
 * one matches words — fitness vocabulary the model has no data for, a strength
 * figure called a chance, markdown a paragraph cannot render. On 2026-09-20 the
 * editorial read *"Haaland stays captain, but Rogers takes the vice armband
 * instead of Calvert-Lewin"* over a screen whose calls were **Haaland → Rogers**
 * for the captaincy and **Calvert-Lewin → Mbeumo** for the vice. Every word of
 * that sentence is allowed. What is wrong is the relationship between the prose
 * and the call list, and no word filter can see a relationship.
 *
 * **The fifth of its kind** — STE-142, STE-146, STE-149 and STE-150 each fixed
 * one thing the editorial said wrongly, and the class kept returning because
 * each fix addressed its instance. These two rules are about the class.
 *
 * Both are code comparing prose against structured data. Neither asks a model
 * anything, and neither is a judgement.
 */
const MOVED_BUT_STAYING = (name: string): RegExp =>
  // Within a short span, because "Haaland stays captain" and "Haaland, who
  // stays" are the same claim and a sentence away is a different subject.
  new RegExp(`${escapeName(name)}[^.!?]{0,40}?\\b(stays?|keeps?|kept|retains?|remains?|holds?)\\b`, 'i')

/** A name is data, not a pattern — Groß and O'Brien must not become syntax. */
const escapeName = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The role words, matched so that *vice-captain* counts as the vice and never
 * as the captain. Without the lookbehind every mention of the vice armband
 * would also read as a mention of the captaincy, and the captain rule would
 * fire on prose that never discussed it.
 */
const MENTIONS: Record<'captain' | 'vice', RegExp> = {
  captain: /(?<!vice[\s-])\bcaptain/i,
  vice: /\bvice\b/i,
}

export function editorialMatchesCalls(text: string, calls: EditorialInput['calls']): true | string {
  for (const c of calls) {
    // **A call moves a player. Prose saying he stays contradicts it outright.**
    // Only the outgoing side: the incoming player genuinely does stay, and a
    // keep reading never reaches here — readings are filtered out before the
    // editorial is written, so a held armband produces no call to contradict.
    if (MOVED_BUT_STAYING(c.out).test(text)) {
      return `${c.out} is moved by a ${c.kind}, and the paragraph says he stays`
    }
  }

  for (const role of ['captain', 'vice'] as const) {
    if (!MENTIONS[role].test(text)) continue
    const call = calls.find((c) => c.role === role)
    /**
     * **A role named with no call behind it is the STE-146 shape one level up:**
     * the model reaching for something it was never given. A held armband is
     * filtered out before it gets here, so it was told nothing about that role
     * at all.
     */
    if (!call) return `the paragraph discusses the ${role} armband, which is not one of this week's calls`
    if (!text.includes(call.in)) {
      return `the paragraph discusses the ${role} armband without naming ${call.in}, who the call gives it to`
    }
  }

  return true
}

/** The paragraph the card shows, and where it came from. */
export function finalEditorial(text: string, input: EditorialInput): { text: string; source: 'model' | 'template' } {
  if (!editorialIsAcceptable(text)) return { text: templateEditorial(input), source: 'template' }

  /**
   * **Logged, because a silent downgrade is how a recurring fault stops being
   * visible.** The template is accurate, so falling back is safe — which is
   * exactly what makes it easy to never notice. The line says which rule
   * tripped, so the next instance is a grep rather than another screenshot.
   */
  const matches = editorialMatchesCalls(text, input.calls)
  if (matches !== true) {
    console.warn(`[editorial] replaced with the template: ${matches}`)
    return { text: templateEditorial(input), source: 'template' }
  }

  return { text: text.trim(), source: 'model' }
}
