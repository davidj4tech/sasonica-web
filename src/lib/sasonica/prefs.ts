/**
 * Sasonica: the per-device settings.
 *
 * Both are about this screen, not the account — where this browser should
 * reach the canvas, and whether this browser wants the timing readout — so
 * they live in localStorage rather than on the Audiobookshelf user, and the
 * phone and the desk can disagree.
 */

const FOLLOW_DEBUG_KEY = 'sasonica.followDebug'

/** Settings → follow-along timing readout. */
export function getFollowDebug(): boolean {
  try {
    return window.localStorage.getItem(FOLLOW_DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

export function setFollowDebug(on: boolean) {
  try {
    if (on) window.localStorage.setItem(FOLLOW_DEBUG_KEY, '1')
    else window.localStorage.removeItem(FOLLOW_DEBUG_KEY)
  } catch {
    // Storage blocked; the readout just stays off.
  }
}
