'use client'

import { getFollowDebug } from '@/lib/sasonica/prefs'
import { useEffect, useState } from 'react'

/**
 * Sasonica: whether this device wants the follow-along timing readout.
 *
 * Read in an effect rather than during render: localStorage does not exist on
 * the server, and a value read during the first render would not match what
 * the server sent.
 */
export function useFollowDebug(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => setOn(getFollowDebug()), [])
  return on
}
