'use client'

import { canvasRequest, ConversationLine, ConversationLogResponse } from '@/lib/sasonica/canvas'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Sasonica: the conversation's turns, kept up to date.
 *
 * The transcript is derived on demand by agent-media — the manifest joined to
 * speech history — so this polls rather than subscribing. The cadence is the
 * interesting part: a conversation is mostly still, and then for a minute at a
 * time it is a voice moving through a paragraph, and the words on screen are
 * meant to keep up with the words in the air.
 */

// The idle cadence, when nothing is in flight: a turn takes longer than this
// to render and publish, so anything faster would mostly ask the same
// question twice.
const POLL_IDLE_MS = 15000
// The cadence while a reply is being worked on. The turn being spoken is in
// the log while it is still audible, so this is how closely the words on
// screen track the words in the air; a second keeps them within a sentence.
// Cheap: the payload is small.
const POLL_FAST_MS = 1000
// Keep the fast cadence for a short while after the transcript last CHANGED,
// so a reply that is still growing (and the moment right after it settles)
// stays snappy no matter who started the turn or how it arrived.
const FAST_LINGER_MS = 20 * 1000
// A ceiling on the fast cadence while merely waiting (pending, but nothing
// changing), so a reply that never comes drops back to idle rather than
// polling fast forever.
const FAST_WINDOW_MS = 3 * 60 * 1000

export interface ConversationLogState {
  lines: ConversationLine[]
  /** Why the last fetch failed, if it did; cleared by the next one that works. */
  error: string
  /** An answer is on its way: the server says so, or a reply was just sent. */
  thinking: boolean
  /** Claude Code's suggested next line for this session, if it has one. */
  suggestion: string
  /** Which line is being spoken by the host right now, or -1. */
  liveIndex: number
  /** Which sentence of that line the voice is on, or -1. */
  liveSentence: number
  /** The numbers behind liveSentence, for the timing readout. */
  timing: LiveTiming | null
  /** Call when a reply has been accepted: show the indicator, poll fast. */
  replied: () => void
  refresh: () => void
}

export interface LiveTiming {
  /** Seconds since the clip was sent, run forward on this page's clock. */
  raw: number
  /** Less the playout delay: where the listener actually is. */
  heard: number
  delay: number
  /** How long ago the server told us `elapsed`. */
  pollAge: number
  /** What the server's own sentence loop says. */
  server: number
  measured: boolean
  target: string
  paused: boolean
  offsets: number[]
}

export function useConversationLog(libraryItemId: string, token: string, enabled: boolean): ConversationLogState {
  const [lines, setLines] = useState<ConversationLine[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  // Local: a reply was just accepted. record_listener_turn renders it on a
  // background thread a beat later, so for that beat neither the listener's
  // line nor `pending` is here yet — this bridges the gap so the indicator
  // shows the instant Send is pressed.
  const [awaiting, setAwaiting] = useState(false)

  // The live turn's clock, run here between polls. `elapsed` is what the
  // server said and `at` is when it said it; the sentence is found on the
  // timeline at elapsed-plus-however-long-ago, so the bold moves with the
  // voice instead of a poll behind it. Skew between the two clocks does not
  // matter: only the local interval is used.
  const clockRef = useRef({ elapsed: 0, at: 0, paused: false })
  const [tick, setTick] = useState(0)

  // A cheap signature of what is on screen, and when it last changed. Any
  // change re-arms the fast cadence, so a turn arriving by ANY route — a
  // reply from this page, a message typed elsewhere, a turn spoken on the
  // host — is picked up promptly rather than waiting out an idle poll.
  const sigRef = useRef('')
  const changedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const linesRef = useRef<ConversationLine[]>([])
  const thinkingRef = useRef(false)

  const thinking = awaiting || pending
  thinkingRef.current = thinking

  const liveIndex = useMemo(() => lines.findIndex((line) => line.live), [lines])

  const fetchLog = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled || !libraryItemId || !token) return
      try {
        const res = await canvasRequest<ConversationLogResponse>('GET', `/conversation/log?item=${encodeURIComponent(libraryItemId)}`, token)
        const next = res.lines || []
        setError('')

        // A reply we were waiting for has landed once Claude has the last
        // word again. Clear the local bridge; `pending` then carries any real
        // wait.
        const last = next[next.length - 1]
        if (last && last.who !== 'you') setAwaiting(false)

        const sig = next.length + '|' + (last ? `${last.who}:${last.text}#${last.live ? last.sentence : ''}` : '')
        if (sig !== sigRef.current) {
          sigRef.current = sig
          changedAtRef.current = Date.now()
        }

        linesRef.current = next
        setLines(next)
        setPending(!!res.pending)
        // The ghost prompt comes with every poll, because it appears a few
        // seconds after the turn it follows. The reply box shows it.
        setSuggestion(res.suggestion || '')

        const live = next.find((line) => line.live)
        if (live && live.elapsed != null) {
          clockRef.current = { elapsed: Number(live.elapsed) || 0, at: Date.now(), paused: !!live.paused }
          setTick((n) => n + 1)
        }
      } catch (err) {
        // Not a conversation, not allowed, no canvas, or the server fell
        // over: the message is the server's when it sent one. Kept even on a
        // quiet refresh so a failure that persists is seen once the lines it
        // was hiding behind are gone — but the lines stay, because blanking a
        // transcript the reader is part-way through over a blinked network
        // would be worse than showing one a few seconds old.
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        if (!quiet) {
          linesRef.current = []
          setLines([])
        }
      }
    },
    [enabled, libraryItemId, token]
  )

  const refresh = useCallback(() => {
    void fetchLog({ quiet: true })
  }, [fetchLog])

  // The next poll's delay, chosen each tick rather than fixed, so the cadence
  // can change between ticks (setTimeout, not setInterval).
  const nextDelay = useCallback(() => {
    // A turn being spoken moves a sentence every few seconds for as long as
    // it lasts; the linger after a change is not enough for a long one.
    if (linesRef.current.some((line) => line.live)) return POLL_FAST_MS
    const since = Date.now() - changedAtRef.current
    if (since < FAST_LINGER_MS) return POLL_FAST_MS
    if (thinkingRef.current && since < FAST_WINDOW_MS) return POLL_FAST_MS
    return POLL_IDLE_MS
  }, [])

  // Only while the page is actually being looked at. A conversation the
  // reader has left is not worth a request every fifteen seconds, and on a
  // backgrounded tab they would queue up and all fire at once on return.
  useEffect(() => {
    if (!enabled || !libraryItemId || !token) return

    let cancelled = false
    const stop = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    const tickOnce = async () => {
      timerRef.current = null
      await fetchLog({ quiet: true })
      if (cancelled || document.hidden) return
      timerRef.current = window.setTimeout(tickOnce, nextDelay())
    }
    const start = () => {
      if (timerRef.current !== null || document.hidden) return
      timerRef.current = window.setTimeout(tickOnce, nextDelay())
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        void fetchLog({ quiet: true })
        start()
      }
    }

    void fetchLog()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, libraryItemId, token, fetchLog, nextDelay])

  // The local clock behind liveSentence: a tick every quarter second while a
  // turn is live is what moves the bold between polls.
  useEffect(() => {
    if (liveIndex < 0) return
    const id = window.setInterval(() => setTick((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [liveIndex])

  const timing = useMemo<LiveTiming | null>(() => {
    void tick // recomputed on every clock tick
    const line = liveIndex >= 0 ? lines[liveIndex] : null
    if (!line) return null
    const { elapsed, at, paused } = clockRef.current
    const raw = paused ? elapsed : elapsed + (Date.now() - at) / 1000
    const delay = Number(line.delay) || 0
    return {
      raw,
      // Less the playout delay: the clock starts when the clip is sent, the
      // voice is heard a beat later (the bridge hop, the player's start), and
      // the bold was running that beat ahead of it. The server says how long
      // for this target — the same figure the terminal highlight waits.
      heard: raw - delay,
      delay,
      pollAge: (Date.now() - at) / 1000,
      server: line.sentence == null ? -1 : line.sentence,
      measured: !!line.measured,
      target: line.target || '?',
      paused,
      offsets: line.offsets || []
    }
  }, [lines, liveIndex, tick])

  // Which sentence of the live turn the voice is on: from the timeline and
  // the local clock when the server sent a timeline, else what it said.
  const liveSentence = useMemo(() => {
    const line = liveIndex >= 0 ? lines[liveIndex] : null
    if (!line || !timing) return -1
    if (!timing.offsets.length) return timing.server
    let index = 0
    timing.offsets.forEach((off, i) => {
      if (timing.heard + 0.001 >= off) index = i
    })
    return index
  }, [lines, liveIndex, timing])

  const replied = useCallback(() => {
    setAwaiting(true)
    changedAtRef.current = Date.now() // treat the send as activity
    void fetchLog({ quiet: true })
  }, [fetchLog])

  return { lines, error, thinking, suggestion, liveIndex, liveSentence, timing, replied, refresh }
}
