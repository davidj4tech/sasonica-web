'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Sasonica: speaking instead of typing.
 *
 * The app borrows the system's recogniser through a Capacitor plugin; a
 * browser has the Web Speech API, which Chrome implements and Firefox does
 * not — so the button that uses this is drawn only when `available` is true,
 * rather than offered and then failing.
 *
 * What is heard is appended to whatever is already in the box: dictation is
 * for adding a sentence, not for replacing a draft.
 */

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function create(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export interface Dictation {
  available: boolean
  listening: boolean
  /** Starts listening; `onHeard` gets the words once, when they settle. */
  listen: (onHeard: (heard: string) => void) => void
}

export function useDictation(): Dictation {
  const [available, setAvailable] = useState(false)
  const [listening, setListening] = useState(false)
  const activeRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setAvailable(!!create())
    return () => activeRef.current?.stop()
  }, [])

  const listen = useCallback(
    (onHeard: (heard: string) => void) => {
      if (listening) return
      const recognition = create()
      if (!recognition) return
      activeRef.current = recognition
      recognition.lang = navigator.language || 'en-US'
      recognition.interimResults = false
      recognition.continuous = false
      recognition.onresult = (event) => {
        const heard = String(event.results?.[0]?.[0]?.transcript || '').trim()
        // Cancelled, or heard nothing: leave what was already typed alone.
        if (heard) onHeard(heard)
      }
      recognition.onerror = () => setListening(false)
      recognition.onend = () => setListening(false)
      setListening(true)
      recognition.start()
    },
    [listening]
  )

  return { available, listening, listen }
}
