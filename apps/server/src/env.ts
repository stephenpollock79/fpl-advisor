/**
 * Environment, validated once at boot.
 *
 * The server refuses to start when a required variable is absent, rather than
 * failing at the first request that needs it (STE-51).
 *
 * The reason is a specific, observed failure. Railway's rollback restores the
 * deployment's snapshot — image *and* variables — so rolling back past the point
 * where a variable was added yields a running process without it, **while the
 * Variables tab still lists it**. The UI shows a variable the process does not
 * have and nothing warns you. With `healthcheckPath: /api/health` already set in
 * railway.json, exiting on a missing variable turns that into a failed deployment
 * within seconds instead of data errors an hour later, traced back to a rollback
 * everyone has forgotten about.
 *
 * Same idiom as row-level security being asserted rather than trusted: make the
 * invisible failure loud.
 */

type Spec = { name: string; required: boolean; why: string }

// Required means "this build reads it". Variables for slices not yet built are
// listed as not-required deliberately — demanding a key nothing uses would block
// boot for no reason and teach everyone to work around this check.
const SPEC: Spec[] = [
  { name: 'SUPABASE_URL', required: true, why: 'Auth and every database read.' },
  { name: 'SUPABASE_ANON_KEY', required: true, why: 'Sending and verifying the six-digit code.' },
  {
    name: 'SUPABASE_SERVICE_KEY',
    required: true,
    why: 'Reference tables and the session table. Never user data — see ADR 0007.',
  },
  { name: 'SESSION_COOKIE_SECRET', required: true, why: 'Signing the session cookie.' },
  { name: 'FFIQ_API_KEY', required: false, why: 'Projections feed. Slice 3.' },
  { name: 'ANTHROPIC_API_KEY', required: false, why: 'Production reasoning path. Slice 4.' },
  { name: 'POSTHOG_KEY', required: false, why: 'Analytics.' },
  // Not required: absent means 8787, which is a working default rather than a
  // fault. Declared so /api/health can answer "what port is this on" without
  // anyone opening the Railway dashboard — the question that prompted this.
  { name: 'PORT', required: false, why: 'Injected by Railway. Absent means the 8787 fallback.' },
]

export type Env = {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceKey: string
  sessionCookieSecret: string
  port: number
  commit: string
  isProduction: boolean
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing = SPEC.filter((s) => s.required && !source[s.name]?.trim())

  if (missing.length > 0) {
    const lines = missing.map((s) => `  ${s.name} — ${s.why}`).join('\n')
    throw new Error(
      `Refusing to start: ${missing.length} required environment variable(s) missing.\n\n${lines}\n\n` +
        'Locally: copy apps/server/.env.example to apps/server/.env and fill it from the dev\n' +
        'Supabase project (Settings -> API). Never commit it.\n\n' +
        'On Railway: if this appeared after a rollback, the deployment snapshot predates the\n' +
        'variable. The Variables tab will still list it — the running process does not have it.\n' +
        'Redeploy rather than re-adding it.\n\n' +
        'There is deliberately no local ANTHROPIC_API_KEY and one must not be created; local and\n' +
        'eval runs authenticate through the Claude Code session. See CLAUDE.md.',
    )
  }

  // The dashboard offers several URLs on one page and the REST one is the easy
  // mistake: `https://<ref>.supabase.co/rest/v1/` looks right and routes every
  // auth call into PostgREST, which answers `PGRST125 Invalid path specified in
  // request URL` — an error with no relationship to the cause. Cost a debug cycle
  // on 2026-09-08; rejected here rather than normalised, because silently
  // repairing a wrong value teaches nobody which value was wanted.
  const url = (source['SUPABASE_URL'] as string).replace(/\/+$/, '')
  if (/\/(rest|auth|storage|realtime)\/v\d/.test(url)) {
    throw new Error(
      `SUPABASE_URL is an API endpoint, not the project URL:\n  ${url}\n\n` +
        'Use the bare project URL — https://<ref>.supabase.co — with no path. The client\n' +
        'appends /auth/v1 and /rest/v1 itself. Supabase\'s API settings page shows both;\n' +
        'the one under "Project URL" is the one wanted.',
    )
  }

  return {
    supabaseUrl: url,
    supabaseAnonKey: source['SUPABASE_ANON_KEY'] as string,
    supabaseServiceKey: source['SUPABASE_SERVICE_KEY'] as string,
    sessionCookieSecret: source['SESSION_COOKIE_SECRET'] as string,
    port: Number(source['PORT'] ?? 8787),
    commit: source['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev',
    isProduction: source['NODE_ENV'] === 'production',
  }
}

/** The full declared surface, so /api/health can report shape without leaking values. */
export const declaredVariables = SPEC.map(({ name, required }) => ({ name, required }))
