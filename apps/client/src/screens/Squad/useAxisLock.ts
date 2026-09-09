/**
 * Lock a two-axis scroller to whichever direction the finger actually meant.
 *
 * A table that scrolls both ways at once drifts diagonally under the thumb, and
 * on a grid of numbers that is disorienting: the row you were reading slides
 * sideways while you were only trying to go down.
 *
 * **CSS cannot do this.** `touch-action` has to be declared before the gesture
 * begins, and the direction is only knowable once it has. So the first few pixels
 * of movement decide, and the other axis is shut off for the rest of the gesture.
 *
 * Deliberately not a scroll-position hack: nothing is repositioned, nothing
 * fights the browser's own momentum. The axis is closed with `overflow: hidden`
 * and reopened when the finger lifts, so within a gesture the browser scrolls
 * exactly as it normally would — just in one direction.
 */

import { type RefObject, useEffect } from 'react'

/** Movement before the direction is called. Below this a gesture is still a tap. */
const DECIDE_AFTER = 6

export function useAxisLock(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let startX = 0
    let startY = 0
    let decided = false

    const start = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      decided = false
      el.style.overflowX = 'auto'
      el.style.overflowY = 'auto'
    }

    const move = (e: TouchEvent) => {
      if (decided) return
      const touch = e.touches[0]
      if (!touch) return

      const dx = Math.abs(touch.clientX - startX)
      const dy = Math.abs(touch.clientY - startY)
      if (dx < DECIDE_AFTER && dy < DECIDE_AFTER) return

      decided = true
      // Whichever axis moved more wins the whole gesture. Ties go to vertical,
      // because reading down a list is the commoner intent.
      if (dx > dy) el.style.overflowY = 'hidden'
      else el.style.overflowX = 'hidden'
    }

    const end = () => {
      decided = false
      el.style.overflowX = 'auto'
      el.style.overflowY = 'auto'
    }

    // Passive: this never calls preventDefault, so the browser is free to start
    // scrolling immediately rather than waiting to see whether we will.
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })

    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref])
}
