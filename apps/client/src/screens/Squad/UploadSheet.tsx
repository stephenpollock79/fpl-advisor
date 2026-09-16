/**
 * Correcting the squad from two screenshots (F2).
 *
 * **It says what each picture is for before either is chosen** (`F2-AC-01`,
 * `F2-AC-02`). No single FPL screen carries everything the parse needs, so
 * being asked for two pictures without being told why reads as a bug.
 *
 * **Chosen from the camera roll, never captured here** (`F2-AC-03`). The source
 * is always an existing screenshot: a photo of a screen is one of the three
 * things that makes a read fail, and an in-app camera would invite exactly it.
 *
 * **No denied state for photo access** (`F2-UP-03`). The operating system's own
 * prompt is the route back; building a bespoke one is parked, and this file is
 * where its absence is deliberate rather than forgotten.
 */

import { useRef, useState } from 'react'
import { ApiError, type UploadFailure, uploadScreenshots } from '../../api'
import styles from './UploadSheet.module.css'

/** What each picture owes, stated before anything is chosen. */
const READS = {
  team: {
    label: 'Team screen',
    gives: 'Your starting eleven, the bench order, the captain and vice-captain, and the chips you have left.',
  },
  transfers: {
    label: 'Transfers screen',
    gives: 'Your bank and your free transfers. They are not on the Team screen, which is why two pictures are needed.',
  },
} as const

type Screen = keyof typeof READS

/**
 * **Downscaled before it is sent, to the largest size the model can actually
 * use — and 1200 threw away half of it** (found 2026-09-16, STE-136).
 *
 * The same two screenshots were read four ways: at full size on Haiku, at full
 * size on Sonnet, and at 1200 on Sonnet, all produced an acceptable fifteen.
 * **The only configuration that failed was this one** — Haiku at 1200, which
 * turns a 1206×2622 phone screenshot into 552×1200, less than half the linear
 * resolution. It failed three ways at once: an opponent read off a shirt
 * sponsor, a phantom second captain's armband, and an empty chip row. The
 * earlier comment here argued 1200 kept every name legible. It does not, and
 * every corroboration check added the night before was refusing a bad read
 * rather than a good squad.
 *
 * **This number is the model's ceiling, not the API's**, and that distinction is
 * the whole reason it is written down rather than rounded. The API applies two
 * limits — a long edge and a visual-token count — in two tiers: 1568px and 1568
 * tokens before Claude 4.7, **2576px and 4784 tokens on 4.7 and later, Sonnet 5
 * included.** An image costs ⌈w/28⌉ × ⌈h/28⌉ tokens, so on the parse's own model
 * a screenshot of this shape arrives at 1185×2576 for 3,956 of the 4,784
 * allowed: the long edge binds first, and nothing above it would be paid for.
 *
 * **So this constant and `PINNED.parse` move together**, and on 2026-09-16 they
 * did. 1568 was Haiku's ceiling, and Haiku at its ceiling put the vice-captain's
 * armband on the wrong shirt in two uploads out of three (STE-136). The parse
 * moved to Sonnet 5 and this moved with it, in one commit: either alone sends
 * the wrong-sized picture to the right model, or the right size to a model that
 * cannot use it, and both read exactly like a change that did nothing.
 *
 * The journey is 860 tokens an image at the original 1200, to 3,956 here — a few
 * pence an upload. An upload is manual and rare; it was never a cost question.
 *
 * **PNG rather than JPEG**, still: JPEG softens exactly the thin text the read
 * depends on, and the saving is not worth a misread name. If a PNG at this size
 * ever trips the server's 4 MB refusal, lossless WebP is the answer — it is
 * supported, it runs well below PNG on flat interface graphics, and it loses
 * nothing. Dropping the edge back would undo this.
 */
const MAX_EDGE = 2576

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('this browser cannot resize an image')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // PNG: FPL's screens are flat colour and text, which JPEG softens exactly
  // where the numbers are.
  return canvas.toDataURL('image/png')
}

export function UploadSheet({ onCancel, onCorrected }: { onCancel: () => void; onCorrected: (locksBroken: number) => void }) {
  const [images, setImages] = useState<Partial<Record<Screen, string>>>({})
  const [failure, setFailure] = useState<UploadFailure | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = useRef<Record<Screen, HTMLInputElement | null>>({ team: null, transfers: null })

  async function choose(screen: Screen, file: File | undefined) {
    if (!file) return
    setFailure(null)
    try {
      setImages((all) => ({ ...all, [screen]: '' }))
      const data = await shrink(file)
      setImages((all) => ({ ...all, [screen]: data }))
    } catch {
      setImages((all) => ({ ...all, [screen]: undefined }))
      setFailure({ screen, because: 'that picture could not be read at all', causes: [] })
    }
  }

  async function send() {
    const team = images.team
    const transfers = images.transfers
    if (!team || !transfers) return

    setBusy(true)
    setFailure(null)
    try {
      const result = await uploadScreenshots(team, transfers)
      if (result.ok) {
        // Straight into the run, exactly as a refresh does (F2-AC-05, F2-AC-06).
        // **The count travels with it.** A call the new squad contradicts is
        // dropped rather than force-kept, and F2-AC-07 asks for the manager to
        // be told why rather than finding the decision gone.
        onCorrected(result.locksBroken)
        return
      }
      setFailure(result.failure)
    } catch (cause) {
      /**
       * **Say what came back, not "could not be reached".** A catch-all that
       * hides the status is the same fault the server had earlier today: it
       * tells the manager nothing he can act on, and sends him back to his
       * camera roll. The code and the size sent are the two things that
       * separate a rejected upload from a broken one.
       */
      const code = cause instanceof ApiError ? cause.code : 'no response'
      const mb = ((team.length + transfers.length) / 1_048_576).toFixed(1)
      setFailure({ screen: 'team', because: `${code}, sending ${mb} MB`, causes: [] })
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(images.team) && Boolean(images.transfers)

  return (
    <div className={styles.scrim} role="dialog" aria-label="Update your squad" data-testid="upload-sheet">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <span className={styles.title}>Update your squad</span>
          <span className={styles.sub}>Two screenshots from the FPL app, straight from your camera roll.</span>
        </header>

        {/* **Stated inline, in a red card, never a toast** — the same shape the
            login screen uses, and for the same reason (F2-UP-01). */}
        {failure ? (
          <div className={styles.failure} role="alert" data-testid="upload-failed">
            <p className={styles.failureHead}>
              Your squad was not updated. {READS[failure.screen].label}: {failure.because}.
            </p>
            {failure.causes.length > 0 ? (
              <ul className={styles.causes}>
                {failure.causes.map((cause) => (
                  <li key={cause}>{cause}</li>
                ))}
              </ul>
            ) : null}
            <p className={styles.failureFoot}>Nothing changed. Try that picture again.</p>
          </div>
        ) : null}

        {(['team', 'transfers'] as const).map((screen) => (
          <section key={screen} className={styles.pick}>
            <span className={styles.pickLabel}>{READS[screen].label}</span>
            <span className={styles.pickGives} data-testid={`reads-${screen}`}>
              {READS[screen].gives}
            </span>
            <input
              ref={(el) => {
                pick.current[screen] = el
              }}
              className={styles.file}
              type="file"
              accept="image/*"
              data-testid={`file-${screen}`}
              onChange={(e) => void choose(screen, e.target.files?.[0])}
            />
            <button
              className={images[screen] ? styles.chosen : styles.choose}
              onClick={() => pick.current[screen]?.click()}
              type="button"
            >
              {images[screen] ? `${READS[screen].label} chosen` : `Choose the ${READS[screen].label}`}
            </button>
          </section>
        ))}

        <button className={styles.go} onClick={() => void send()} disabled={!ready || busy} data-testid="upload-go" type="button">
          {busy ? 'Reading both…' : 'Update my squad'}
        </button>
        <button className={styles.quiet} onClick={onCancel} disabled={busy} type="button">
          Cancel
        </button>
      </div>
    </div>
  )
}
