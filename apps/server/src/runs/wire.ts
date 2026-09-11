/**
 * The real collaborators behind `POST /api/runs`.
 *
 * `run` and `call` are user data: written with the signed-in user's own token,
 * never the service key, which has no grant on either (ADR 0007). The feeds are
 * reference data and are ingested with the service key, as on first open.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { ingestWorld } from '../ingest/run.js'
import { modelFromEnv } from '../model/client.js'
import { fillMissingPurchasePrices } from '../squad/store.js'
import { userClient } from '../supabase.js'
import { loadWeek } from './load.js'
import type { RunDeps } from './routes.js'

export function runDeps(authenticate: RunDeps['authenticate']): RunDeps {
  return {
    authenticate,

    // Feeds are fetched on open and on an explicit run, never on a schedule
    // (CLAUDE.md, *Do not*). A run works from what FPL says now.
    async prepare(user) {
      await ingestWorld()
      await fillMissingPurchasePrices(user)
    },

    loadWeek,

    model: () => modelFromEnv(),

    async startRun(user, gameweek, snapshotId) {
      const db = userClient(user.accessToken)
      const { count } = await db
        .from('run')
        .select('id', { count: 'exact', head: true })
        .eq('gameweek', gameweek)
        .eq('status', 'succeeded')
      const { data, error } = await db
        .from('run')
        .insert({
          user_id: user.userId,
          gameweek,
          squad_snapshot_id: snapshotId,
          status: 'running',
          trigger: (count ?? 0) > 0 ? 'refresh' : 'first_open',
        })
        .select('id')
        .single()
      if (error) throw new Error(`could not start the run: ${error.message}`)
      return (data as { id: string }).id
    },

    async finishRun(user: AuthenticatedUser, runId, gameweek, calls, modelCalls) {
      const db = userClient(user.accessToken)

      if (calls.length > 0) {
        const { error } = await db.from('call').insert(
          calls.map((c) => ({
            user_id: user.userId,
            run_id: runId,
            gameweek,
            call_key: c.key,
            category: c.category,
            shape: c.shape,
            out_player_id: c.outPlayerId,
            in_player_id: c.inPlayerId,
            net: c.net,
            conviction: c.conviction,
            band: c.band,
            k_used: c.k,
            points_hit: c.pointsHit,
            cost_tenths: c.costTenths,
            is_forced: c.isForced,
            watch_flag: c.watch,
            reasoning: c.reasoning,
            reasoning_source: c.reasoningSource,
            breakdown: c.breakdown,
            alternatives: c.alternatives,
            position: c.position,
          })),
        )
        if (error) throw new Error(`could not store the calls: ${error.message}`)
      }

      const { error } = await db
        .from('run')
        .update({
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          model_calls: modelCalls,
          input_tokens: modelCalls.reduce((sum, m) => sum + m.inputTokens, 0),
          output_tokens: modelCalls.reduce((sum, m) => sum + m.outputTokens, 0),
          // A call with no price on file adds nothing here; its tokens are still
          // recorded, and model_calls says which call it was.
          cost_usd: modelCalls.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
        })
        .eq('id', runId)
      if (error) throw new Error(`could not finish the run: ${error.message}`)
    },

    async failRun(user, runId, modelCalls) {
      await userClient(user.accessToken)
        .from('run')
        .update({ status: 'failed', finished_at: new Date().toISOString(), model_calls: modelCalls })
        .eq('id', runId)
    },
  }
}
