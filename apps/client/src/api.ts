// Data fetching lives here, never in a component (CLAUDE.md, Architecture
// invariants). This module is the single place a move off client rendering
// would have to happen — see ADR 0005's reversal cost.

export type Health = {
  status: string
  commit: string
  uptimeSeconds: number
  engine: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal })
  if (!response.ok) throw new Error(`/api/health responded ${response.status}`)
  return (await response.json()) as Health
}
