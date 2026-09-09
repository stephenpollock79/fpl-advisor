import { useCallback, useEffect, useState } from 'react'
import { type Me, fetchMe } from './api'
import { LinkTeam } from './screens/LinkTeam/LinkTeam'

/**
 * What the app shows, in the only three states slice 2 can reach.
 *
 * The Landing screen — the one place a signed-out visitor lands, with the log-in
 * card on it — is F7-AC-16 and arrives with slice 8. Until then the signed-out
 * state says so plainly rather than pretending to be a product screen: an invented
 * placeholder that looks like a login is worse than an honest note, because the
 * next person to open it cannot tell which parts were designed.
 *
 * F7-AC-15: onboarding is the team link and nothing else. Once linked, the screen
 * is never shown again — it is gated on needsTeamLink, which the server derives.
 */
export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    return fetchMe(signal)
      .then(setMe)
      .catch((cause: unknown) => {
        if (signal?.aborted) return
        if (cause instanceof Error && cause.name === 'AbortError') return
        setFailed(true)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (failed) return <Note>Could not reach the app. Try again in a moment.</Note>
  if (me === undefined) return <Note>Loading…</Note>
  if (me === null) return <Note>Not signed in. The log-in screen arrives with slice 8 (F7-AC-16).</Note>
  if (me.needsTeamLink) return <LinkTeam onLinked={() => void load()} />

  return (
    <Note>
      Linked to {me.manager?.team_name ?? 'your team'}. The squad screen is slice 3 (STE-56).
    </Note>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: 24, fontSize: 13, lineHeight: 1.5, color: '#46433d' }}>{children}</main>
  )
}
