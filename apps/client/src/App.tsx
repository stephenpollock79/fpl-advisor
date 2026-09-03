import { useEffect, useState } from 'react'
import { engineIdentity } from '@fpl/engine'
import { fetchHealth, type Health } from './api'

// Utilitarian on purpose. The Design System is STE-74 and no token from it
// appears here; this screen exists to prove client, API and engine import
// resolve on one origin, and is replaced by the real Landing screen (F7).
export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.abort()
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>The Gaffer — skeleton</h1>
      <p style={{ margin: '0 0 8px' }}>Client bundle: running.</p>
      <p style={{ margin: '0 0 8px' }}>Engine, imported by the client: {engineIdentity()}</p>
      {error ? <p style={{ margin: 0, color: '#b3261e' }}>API unreachable: {error}</p> : null}
      {health ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(health, null, 2)}</pre>
      ) : null}
      {!health && !error ? <p style={{ margin: 0 }}>Calling /api/health…</p> : null}
    </main>
  )
}
