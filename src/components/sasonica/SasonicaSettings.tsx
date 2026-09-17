'use client'

import TextInput from '@/components/ui/TextInput'
import ToggleSwitch from '@/components/ui/ToggleSwitch'
import { canvasBaseUrl, setCanvasBaseUrl } from '@/lib/sasonica/canvas'
import { getFollowDebug, setFollowDebug } from '@/lib/sasonica/prefs'
import { S } from '@/lib/sasonica/strings'
import { useEffect, useState } from 'react'

/**
 * Sasonica: the two settings that belong to this device rather than the account.
 *
 * Where to reach agent-media's canvas — blank means this server on 8781, which
 * is right whenever Audiobookshelf and agent-media are the same machine — and
 * whether to show the follow-along timing readout under a reply being spoken.
 *
 * Both are read from localStorage in an effect, not during render: it does not
 * exist on the server, and a value read during the first render would not
 * match the HTML the server sent.
 */
export default function SasonicaSettings() {
  const [url, setUrl] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [debug, setDebug] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      setUrl(window.localStorage.getItem('sasonica.canvasUrl') || '')
    } catch {
      setUrl('')
    }
    // What blank will actually use, so the box says what it is defaulting to.
    setPlaceholder(canvasBaseUrl())
    setDebug(getFollowDebug())
    setReady(true)
  }, [])

  if (!ready) return null

  return (
    <div className="mt-10 w-full">
      <p className="text-foreground-muted mb-2 text-xs font-semibold uppercase">{S.settingsHeading}</p>

      <div className="py-3">
        <TextInput
          value={url}
          label={S.settingsCanvasLabel}
          placeholder={placeholder || 'http://host:8781'}
          onChange={(value: string) => {
            setUrl(value)
            setCanvasBaseUrl(value)
          }}
        />
        <p className="text-foreground-muted pt-1 text-xs">{S.settingsCanvasHelp}</p>
      </div>

      <div className="flex items-center py-3">
        <div className="grow">
          <p>{S.settingsTimingLabel}</p>
          <p className="text-foreground-muted pt-1 text-xs">{S.settingsTimingHelp}</p>
        </div>
        <ToggleSwitch
          value={debug}
          ariaLabel={S.settingsTimingLabel}
          onChange={(value) => {
            setDebug(value)
            setFollowDebug(value)
          }}
        />
      </div>
    </div>
  )
}
