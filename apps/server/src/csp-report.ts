import { Hono } from 'hono'

/**
 * Where the report-only policy sends what it would have refused (STE-161).
 *
 * **It exists because the violations happen on Stephen's phone, not here.** The
 * policy can only be flipped to enforcing once something has seen what it would
 * block across the screens actually used, and a console he cannot open reports
 * to nobody.
 *
 * **A factory rather than a route on the app**, so that
 * `tests/security/route-surface.test.ts` can find it. That test discovers the
 * unauthenticated surface from the route factories themselves; a route declared
 * inline in `index.ts` is invisible to it, and an unauthenticated route the
 * surface test structurally cannot see is the false green this repo keeps
 * designing against.
 */
export function cspReportRoutes() {
  const app = new Hono()

  /**
   * Unauthenticated by necessity — a browser posts a violation report without
   * credentials, and gating it would mean learning nothing until after sign-in,
   * which is the half of the app the policy most needs checking on.
   *
   * So it reads a bounded prefix, writes one operator line, and returns nothing.
   * The worst an abuser gets is noise in a log.
   */
  app.post('/api/csp-report', async (c) => {
    const body = (await c.req.text().catch(() => '')).slice(0, 2000)
    if (body) console.warn('[csp] would have blocked:', body)
    return c.body(null, 204)
  })

  return app
}
