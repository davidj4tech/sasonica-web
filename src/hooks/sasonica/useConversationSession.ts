'use client'

import { canvasRequest, ConversationState } from '@/lib/sasonica/canvas'
import { useCallback, useEffect, useState } from 'react'

/**
 * Sasonica: is this library item a conversation, and is its session running?
 *
 * Asked once when the item page opens, before anything conversation-shaped is
 * drawn. On an ordinary audiobook — and on a server with no canvas reachable,
 * and for a user who is not allowed to reply — the answer is no and the page
 * is upstream's, unchanged.
 *
 * The app asks a trimmed /item endpoint that carries the flag on the item
 * itself; the web client gets its item straight from Audiobookshelf, which
 * knows nothing about conversations, so it asks here instead. That costs one
 * request per item page and nothing else.
 */

export interface ConversationSession extends ConversationState {
  /** Still asking. The page waits rather than flashing the book chrome. */
  loading: boolean
  /** Bring the desk's tmux client to the pane this session runs in. */
  goToPane: () => Promise<void>
  /** After a reply reopens an ended session, or moves it. */
  setLive: (live: boolean, pane: string | null) => void
}

const ABSENT: ConversationState = { ok: false, live: false, pane: null, session: null, resumable: false }

export function useConversationSession(libraryItemId: string, token: string): ConversationSession {
  const [state, setState] = useState<ConversationState>(ABSENT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!libraryItemId || !token) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    canvasRequest<ConversationState>('GET', `/conversation?item=${encodeURIComponent(libraryItemId)}`, token, undefined, controller.signal)
      .then((res) => {
        if (cancelled) return
        setState({ ok: !!res.ok, live: !!res.live, pane: res.live ? (res.pane ?? null) : null, session: res.session ?? null, resumable: !!res.resumable })
      })
      .catch(() => {
        // Not a conversation, not allowed, or no canvas reachable — all of
        // which mean the same thing here: this is an ordinary item.
        if (!cancelled) setState(ABSENT)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [libraryItemId, token])

  const goToPane = useCallback(async () => {
    if (!state.pane) return
    try {
      await canvasRequest('POST', '/focus', token, { pane: state.pane })
    } catch (err) {
      console.error('[Sasonica] focus failed', err)
    }
  }, [state.pane, token])

  const setLive = useCallback((live: boolean, pane: string | null) => {
    setState((prev) => ({ ...prev, live, pane }))
  }, [])

  return { ...state, loading, goToPane, setLive }
}
