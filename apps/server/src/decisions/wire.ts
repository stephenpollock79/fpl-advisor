/**
 * The real collaborators behind `POST /api/decisions`.
 *
 * **Decisions are user data, written with the signed-in user's own token** —
 * never the service key, which has no grant on `decision` and would be refused
 * if it tried (ADR 0007). The gameweek is reference data, read with the service
 * key.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { referenceClient, userClient } from '../supabase.js'
import type { DecisionDeps } from './routes.js'

export function decisionDeps(authenticate: DecisionDeps['authenticate']): DecisionDeps {
  return {
    authenticate,

    async gameweek() {
      const { data } = await referenceClient().from('gameweek').select('id').eq('is_next', true).limit(1)
      const id = (data as { id: number }[] | null)?.[0]?.id
      if (id === undefined) throw new Error('No gameweek is next. Refusing to file a decision against the wrong week.')
      return id
    },

    async record(user: AuthenticatedUser, gameweek, callKey, state) {
      const { error } = await userClient(user.accessToken)
        .from('decision')
        .upsert({
          user_id: user.userId,
          gameweek,
          call_key: callKey,
          state,
          decided_at: new Date().toISOString(),
        })
      if (error) throw new Error(`could not record the decision: ${error.message}`)
    },

    async clear(user: AuthenticatedUser, gameweek, callKey) {
      const { error } = await userClient(user.accessToken)
        .from('decision')
        .delete()
        .eq('gameweek', gameweek)
        .eq('call_key', callKey)
      if (error) throw new Error(`could not return the call to pending: ${error.message}`)
    },
  }
}
