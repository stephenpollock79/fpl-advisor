/**
 * Two small facts about reading the reference tables that every loader needs.
 *
 * **`player_state` holds one set of rows per feed read**, so "a player's status"
 * means his row in the latest successful read — not any row, and not whichever
 * one a query happens to return last. Reading without that filter returns every
 * read ever made and lets a stale price or a cleared injury win silently.
 *
 * **PostgREST answers at most a thousand rows a request.** The player pool is
 * about 650 and three gameweeks of projections nearly two thousand, so anything
 * that reads the whole world pages rather than trusting one request to be all.
 */

import { referenceClient } from '../supabase.js'

export async function latestRead(source: 'fpl_bootstrap' | 'ffiq'): Promise<{ id: string; fetchedAt: string } | null> {
  const { data, error } = await referenceClient()
    .from('feed_read')
    .select('id, fetched_at')
    .eq('source', source)
    .eq('succeeded', true)
    .order('fetched_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`could not find the latest ${source} read: ${error.message}`)
  const row = (data as { id: string; fetched_at: string }[] | null)?.[0]
  return row ? { id: row.id, fetchedAt: row.fetched_at } : null
}

export async function latestReadId(source: 'fpl_bootstrap' | 'ffiq'): Promise<string | null> {
  return (await latestRead(source))?.id ?? null
}

const PAGE = 1000

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Every row a query matches, a thousand at a time. */
export async function everyRow<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(`could not read rows ${String(from)}+: ${error.message}`)
    const chunk = (data as T[] | null) ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}
