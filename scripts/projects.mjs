/**
 * The two Supabase projects, by name.
 *
 * **A project ref is not a secret** — it is the hostname of a public API URL,
 * and it is printed by `supabase projects list` to anyone who runs it. The keys
 * are the secrets, and none of them are here.
 *
 * One copy. It lived inside `live-rls-check.mjs` until `db-push.mjs` needed the
 * same two values, and two scripts each holding their own idea of which ref is
 * production is the exact shape of the fault that made this file necessary.
 */
export const PROJECTS = {
  dev: 'wtzdzjvvefbcgxdfxqom',
  prod: 'bibsndkwgrnsklnzckim',
}

/** The ref the Supabase CLI is currently linked to, or null when nothing is. */
export const linkedRef = (readFileSync) => {
  try {
    return readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim() || null
  } catch {
    return null
  }
}

/** Which of the two a ref is, for telling the manager what he is actually pointed at. */
export const nameOfRef = (ref) => Object.entries(PROJECTS).find(([, value]) => value === ref)?.[0] ?? null
