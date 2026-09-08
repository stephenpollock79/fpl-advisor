import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { engineIdentity } from '@fpl/engine'
import { Hono } from 'hono'
import { authRoutes } from './auth/routes.js'
import { declaredVariables, loadEnv } from './env.js'
import { configureSupabase } from './supabase.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, 'public')
// The file, not the directory. tsup cleans dist/ and `copy:client` refills
// dist/public afterwards, so a half-finished build can leave the directory there
// with no index.html in it — and testing the directory then crashes the process
// at boot instead of falling back to serving the API. On Railway that is a failed
// health check with a stack trace, which is fail-safe but reads like a broken
// deploy rather than a broken build.
const INDEX_HTML = join(PUBLIC_DIR, 'index.html')

// Boot-time validation, before anything else. A missing required variable exits
// here rather than surfacing as a data error at the first request that needs it
// — see env.ts for the Railway rollback case this exists for.
const env = loadEnv()
configureSupabase(env)

const PORT = env.port
const COMMIT = env.commit

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    commit: COMMIT,
    uptimeSeconds: Math.round(process.uptime()),
    engine: engineIdentity(),
    // Names and required-ness only, never values. Enough to see that a rollback
    // has left the process without something, without publishing a key.
    env: declaredVariables.map((v) => ({
      ...v,
      present: Boolean(process.env[v.name]?.trim()),
    })),
  }),
)

app.route('/', authRoutes(env))

// Every other /api path is a JSON 404. Without this the SPA fallback below
// would answer a mistyped fetch with index.html, and the caller would fail on
// parsing HTML as JSON somewhere far from the cause.
app.all('/api/*', (c) => c.json({ error: 'not_found', path: c.req.path }, 404))

if (existsSync(INDEX_HTML)) {
  // serveStatic resolves its root against process.cwd(), so derive the relative
  // path rather than assuming where the process was started from.
  const root = relative(process.cwd(), PUBLIC_DIR) || '.'
  const indexHtml = readFileSync(INDEX_HTML, 'utf8')

  app.use('/*', serveStatic({ root }))
  app.get('*', (c) => c.html(indexHtml))
} else {
  console.warn(
    `[server] no client build at ${INDEX_HTML} — serving the API only. ` +
      'This is expected under `pnpm dev`, where Vite serves the client and proxies /api here.',
  )
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port} (commit ${COMMIT})`)
})
