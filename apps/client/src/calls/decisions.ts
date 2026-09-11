/**
 * The week's decisions, held per call (F3-AC-01, F3-AC-02).
 *
 * Three states and no fourth: *selected*, *rejected*, and pending — which is the
 * absence of an entry, exactly as the server stores it. `reopened` remembers the
 * decision a call had when Category cleared returned it to pending, so the
 * second tap restores it (F3-AC-14). A reopened call is pending in every sense
 * the rest of the app reads.
 *
 * Pure. The screen applies these and tells the server; nothing here fetches.
 */

import type { DecisionState } from '../api'

export type Decisions = {
  decisions: Record<string, DecisionState>
  reopened: Record<string, DecisionState>
}

export const initialDecisions = (decisions: Record<string, DecisionState>): Decisions => ({
  decisions: { ...decisions },
  reopened: {},
})

/** Select or reject. Deciding anew forgets what a reopened call used to be. */
export function decide(state: Decisions, key: string, decision: DecisionState): Decisions {
  const reopened = { ...state.reopened }
  delete reopened[key]
  return { decisions: { ...state.decisions, [key]: decision }, reopened }
}

/** Leave it pending — swipe up, or Later. Nothing is stored. */
export function defer(state: Decisions, key: string): Decisions {
  const decisions = { ...state.decisions }
  delete decisions[key]
  return { ...state, decisions }
}

/** Category cleared, first tap: back to pending review, remembering the decision. */
export function reopen(state: Decisions, key: string): Decisions {
  const had = state.decisions[key]
  if (had === undefined) return state
  const decisions = { ...state.decisions }
  delete decisions[key]
  return { decisions, reopened: { ...state.reopened, [key]: had } }
}

/** Category cleared, second tap: the decision it had, restored. */
export function restore(state: Decisions, key: string): Decisions {
  const had = state.reopened[key]
  if (had === undefined) return state
  return decide(state, key, had)
}
