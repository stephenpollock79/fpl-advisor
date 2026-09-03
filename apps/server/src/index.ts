import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { engineIdentity } from '@fpl/engine'
import { Hono } from 'hono'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, 'public')
const PORT = Number(process.env['PORT'] ?? 8787)

// Railway injects the deployed commit. Reading it back from /api/health is what
// makes STE-25's rollback test verifiable — you can see which deployment is
// actually live rather than inferring it.
const COMMIT = process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    commit: COMMIT,
    uptimeSeconds: Math.round(process.uptime()),
    engine: engineIdentity(),
  }),
)

// Every other /api path is a JSON 404. Without this the SPA fallback below
// would answer a mistyped fetch with index.html, and the caller would fail on
// parsing HTML as JSON somewhere far from the cause.
app.all('/api/*', (c) => c.json({ error: 'not_found', path: c.req.path }, 404))

if (existsSync(PUBLIC_DIR)) {
  // serveStatic resolves its root against process.cwd(), so derive the relative
  // path rather than assuming where the process was started from.
  const root = relative(process.cwd(), PUBLIC_DIR) || '.'
  const indexHtml = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8')

  app.use('/*', serveStatic({ root }))
  app.get('*', (c) => c.html(indexHtml))
} else {
  console.warn(
    `[server] no client build at ${PUBLIC_DIR} — serving the API only. ` +
      'This is expected under `pnpm dev`, where Vite serves the client and proxies /api here.',
  )
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port} (commit ${COMMIT})`)
})
