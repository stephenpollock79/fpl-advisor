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
import type { EvidenceRow } from '../refresh/evidence.js'
import type { DecisionState, LockableCall } from '../refresh/locks.js'
import { referenceClient, userClient } from '../supabase.js'
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

    /**
     * The two sides of the diff, plus the manager's answers.
     *
     * `before` is the read the last **successful** run was built from, which is
     * what `run.feed_read_id` exists for. Null where there has never been one —
     * and null means everything is new, which is the safe direction: a first run
     * must never be skipped on the strength of a comparison it could not make.
     */
    async refreshInputs(user) {
      const db = userClient(user.accessToken)
      const reference = referenceClient()

      const { data: runs } = await db
        .from('run')
        .select('id, feed_read_id')
        .eq('status', 'succeeded')
        .order('finished_at', { ascending: false })
        .limit(1)
      const lastRun = (runs as { id: string; feed_read_id: string | null }[] | null)?.[0] ?? null

      const { data: newest } = await reference
        .from('feed_read')
        .select('id')
        .eq('source', 'fpl_bootstrap')
        .order('fetched_at', { ascending: false })
        .limit(1)
      const feedReadId = ((newest as { id: string }[] | null)?.[0]?.id) ?? null

      const rows = async (readId: string | null): Promise<EvidenceRow[] | null> => {
        if (!readId) return null
        const { data } = await reference
          .from('player_state')
          .select('player_id, status, news, news_added, chance_of_playing_next_round, now_cost_tenths')
          .eq('feed_read_id', readId)
        return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          playerId: r['player_id'] as number,
          status: r['status'] as EvidenceRow['status'],
          news: (r['news'] as string | null) ?? null,
          newsAdded: (r['news_added'] as string | null) ?? null,
          chanceOfPlayingNextRound: (r['chance_of_playing_next_round'] as number | null) ?? null,
          nowCostTenths: r['now_cost_tenths'] as number,
        }))
      }

      const { data: callRows } = lastRun
        ? await db.from('call').select('call_key, category, out_player_id, in_player_id, cost_tenths, alternatives').eq('run_id', lastRun.id)
        : { data: [] as Record<string, unknown>[] }
      const { data: decisionRows } = await db.from('decision').select('call_key, state')

      return {
        before: await rows(lastRun?.feed_read_id ?? null),
        after: (await rows(feedReadId)) ?? [],
        feedReadId,
        calls: ((callRows ?? []) as Record<string, unknown>[]).map((c) => ({
          key: c['call_key'] as string,
          category: c['category'] as LockableCall['category'],
          outPlayerId: c['out_player_id'] as number,
          inPlayerId: c['in_player_id'] as number,
          costTenths: c['cost_tenths'] as number,
          alternatives: (c['alternatives'] as LockableCall['alternatives']) ?? null,
        })),
        decisions: Object.fromEntries(
          ((decisionRows ?? []) as Record<string, unknown>[]).map((d) => [d['call_key'] as string, d['state'] as DecisionState]),
        ),
        // The swapped pair's cost, from the prices already in hand.
        costOfSwap: () => 0,
      }
    },

    model: () => modelFromEnv(),

    async startRun(user, gameweek, snapshotId, feedReadId) {
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
          feed_read_id: feedReadId,
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
            is_reading: c.isReading,
            reading_reason: c.readingReason,
            watch_flag: c.watch,
            watch_reason: c.watchReason,
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

    /**
     * A streamed run that stopped. **Cancelled is stored as cancelled, never as
     * failed** (F6-AC-20): a cancelled run is treated exactly as one that never
     * started, and calling it a failure would put it in front of the manager as
     * something that went wrong when he is the one who stopped it.
     *
     * Neither ages the advice — the last-run time reads the last *succeeded* run
     * and neither of these is one.
     */
    async endRun(user, runId, status) {
      await userClient(user.accessToken)
        .from('run')
        .update({ status, finished_at: new Date().toISOString() })
        .eq('id', runId)
    },
  }
}
