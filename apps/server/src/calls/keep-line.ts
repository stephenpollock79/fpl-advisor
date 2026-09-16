/**
 * The sentence on a keep reading (F4-AC-01, F4-AC-02).
 *
 * **A reading never goes through the model, and that is a correctness rule
 * rather than a saving.** Three things break if it does. It carries no strength
 * and no band, so the prompt would put the word `undefined` in front of the
 * model. The prompt hard-codes a `+` before the net, and a reading's net is
 * routinely negative. And the engine's own fallback, `templateReasoning`,
 * phrases every line as *"X over Y"* — which on a keep recommends the player the
 * card is telling the manager not to move to, directly above a panel reading
 * *nothing to do*.
 *
 * So the line is written here, from the same evaluation rows the card shows, and
 * stored as `template`. Nothing in it is computed: the figures come off the rows.
 */

import type { EvaluationRow } from '@fpl/engine'

/**
 * Why the app is not proposing a change, in the manager's terms.
 *
 * `incumbent_wins` and `below_floor` are the engine's own two reasons and the
 * only two there are. The first says the holder is simply ahead; the second says
 * the two are close enough that the figures cannot tell them apart, which is a
 * different sentence and must not be flattened into the first.
 */
export function keepLine(
  reason: 'incumbent_wins' | 'below_floor',
  rows: readonly EvaluationRow[],
  holderName: string,
): string {
  const xpts = rows.find((r) => r.key === 'xpts')
  const held = (xpts?.out ?? 0).toFixed(1)

  // **No rival is named.** The card shows the holder alone (F4 happy path,
  // amended 2026-09-14), and a sentence that names someone the card does not
  // show puts the comparison back in words after taking it out of the layout.
  return reason === 'incumbent_wins'
    ? `${holderName} keeps it: ${held} projected points this gameweek, the highest in your eleven.`
    : `${holderName} keeps it: ${held} projected points, and nothing in your eleven is clear enough of him to justify a change.`
}

/**
 * **Why a forced call is being made, in the manager's terms — and why the model
 * is not asked** (found live 2026-09-16, STE-143).
 *
 * A forced call is not a comparison. The holder cannot fill the role, so the
 * best of those who can takes it — and that is true whether or not he is the
 * better player. **The model is handed the two players' figures and nothing
 * else**, so asked to explain such a call it can only build a comparative case,
 * and on a forced call the comparison usually runs the other way.
 *
 * That is exactly what shipped: the vice armband had to move off Calvert-Lewin
 * because he was taking the captaincy, and the card read *"Rogers' superior
 * form and season points make him the safer armband bet"* — directly above a
 * row showing 7.9 against 6.7. **Not a weak argument, a false one.**
 *
 * Same treatment a keep already gets, and for the same reason: where the
 * comparison misleads, the sentence is code's.
 */
export function forcedLine(
  kind: 'captain' | 'vice' | 'transfer' | 'substitution',
  rows: readonly EvaluationRow[],
  outName: string,
  inName: string,
): string {
  const xpts = rows.find((r) => r.key === 'xpts')
  const takes = (xpts?.in ?? 0).toFixed(1)

  return kind === 'captain' || kind === 'vice'
    ? `${outName} cannot hold this armband as things now stand, so it has to move. ${inName} is the best of those who can, on ${takes} projected points.`
    : `${outName} cannot play this gameweek, so he has to come out. ${inName} is the best replacement available, on ${takes} projected points.`
}

