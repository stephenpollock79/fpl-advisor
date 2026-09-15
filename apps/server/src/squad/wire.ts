/**
 * The real collaborators behind `POST /api/squad/screenshots`.
 *
 * Kept apart from the route so the route stays testable with stubs, and so the
 * one rule that matters is visible in one place: **the manager's squad, calls
 * and decisions are read and written with the manager's token.** The gameweek
 * is reference data and read with the service key.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { contradictedBy } from '../refresh/contradicted.js'
import { modelFromEnv } from '../model/client.js'
import { referenceClient, userClient } from '../supabase.js'
import { storeCorrectedSquad } from './store.js'
import type { ScreenshotDeps } from './screenshots.js'

export function screenshotDeps(authenticate: ScreenshotDeps['authenticate']): ScreenshotDeps {
  return {
    authenticate,
    model: modelFromEnv,

    /**
     * **`is_next`, never `is_current`.** The feed marks a gameweek current until
     * the following one locks, so keying off it would file a correction against
     * a week already played — confidently, with nothing on screen to say so.
     */
    async advisedGameweek() {
      const { data } = await referenceClient().from('gameweek').select('id').eq('is_next', true).limit(1)
      const next = (data as { id: number }[] | null)?.[0]?.id
      if (next === undefined) throw new Error('no gameweek is marked next, so there is nothing to correct against')
      return next
    },

    storeCorrectedSquad,

    /**
     * **The screenshot wins** (F2-AC-07, F6-RS-07). Where the new squad
     * contradicts a selected call, the lock is broken and dropped rather than
     * force-kept — and the row is kept, carrying which snapshot broke it, so the
     * manager can be told why rather than finding his decision gone.
     */
    async breakContradictedLocks(user: AuthenticatedUser, gameweek: number, snapshotId: string) {
      const db = userClient(user.accessToken)

      const [{ data: squadRows }, { data: decisionRows }, { data: callRows }] = await Promise.all([
        db.from('squad_player').select('player_id').eq('snapshot_id', snapshotId),
        db.from('decision').select('call_key').eq('gameweek', gameweek).eq('state', 'selected').is('broken_by_snapshot_id', null),
        db.from('call').select('call_key, category, out_player_id, in_player_id').eq('gameweek', gameweek),
      ])

      const squad = ((squadRows ?? []) as { player_id: number }[]).map((r) => r.player_id)
      const selectedKeys = new Set(((decisionRows ?? []) as { call_key: string }[]).map((r) => r.call_key))

      const selected = ((callRows ?? []) as Record<string, unknown>[])
        .filter((c) => selectedKeys.has(c['call_key'] as string))
        .map((c) => ({
          key: c['call_key'] as string,
          outPlayerId: c['out_player_id'] as number,
          inPlayerId: c['in_player_id'] as number,
          // Only a transfer moves anyone in or out of the fifteen. A
          // substitution and a captaincy call rearrange players already in it,
          // so a squad list cannot contradict them.
          movesSquad: c['category'] === 'transfer',
        }))

      const broken = contradictedBy(squad, selected)
      if (broken.length === 0) return 0

      const { error } = await db
        .from('decision')
        .update({ broken_by_snapshot_id: snapshotId })
        .eq('gameweek', gameweek)
        .in('call_key', broken)
      if (error) throw new Error(`could not break the contradicted locks: ${error.message}`)

      return broken.length
    },
  }
}
