/**
 * Reading a JSON request body without trusting it to be an object.
 *
 * **Every route had its own version of this and three of them were wrong**
 * (STE-38). The idiom was `await c.req.json().catch(() => ({}))`, which handles
 * a body that is not JSON and does nothing about a body that is *valid* JSON and
 * not an object. `null` is valid JSON. So is `[]`, and `"hello"`, and `42`.
 *
 * `const { email } = null` throws, and a throw inside a Hono handler is a 500 —
 * which a stranger could produce on the login route, unauthenticated, with a
 * four-character request body. Found by the red-team probes on the live app.
 *
 * **The `.catch` looked like the guard and was only half of one.** That is the
 * shape worth remembering: a defence written against the failure someone
 * imagined, sitting next to the failure they did not.
 */

/**
 * The request body as a plain object, or an empty one.
 *
 * Anything that is not a JSON object — unparseable, `null`, an array, a string,
 * a number — reads as no fields at all, so the caller's own validation rejects
 * it with a 400 rather than the process throwing on the way past. Arrays are
 * excluded deliberately: `[]['email']` is `undefined` rather than a throw, so an
 * array would slip through as a silently empty object and hide the input that
 * produced it.
 */
export async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  const parsed = await request.json().catch(() => null)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}
