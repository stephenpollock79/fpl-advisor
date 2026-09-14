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
  challengerName: string,
): string {
  const xpts = rows.find((r) => r.key === 'xpts')
  const held = (xpts?.out ?? 0).toFixed(1)
  const other = (xpts?.in ?? 0).toFixed(1)

  return reason === 'incumbent_wins'
    ? `${holderName} keeps it: ${held} projected points this gameweek against ${challengerName}'s ${other}.`
    : `${holderName} keeps it: ${held} against ${challengerName}'s ${other} is too close to call a change on.`
}
