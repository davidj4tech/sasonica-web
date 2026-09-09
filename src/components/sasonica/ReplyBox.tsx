'use client'

import { useDictation } from '@/hooks/sasonica/useDictation'
import { CanvasError, ReplyResponse, canvasRequest } from '@/lib/sasonica/canvas'
import { S } from '@/lib/sasonica/strings'
import { useCallback, useRef, useState } from 'react'

/**
 * Sasonica: reply to a conversation from inside the player.
 *
 * A conversation in this library is a Claude Code session someone recorded.
 * This box puts a line back into that session — reviving it in a tmux window
 * on the host if it has since ended. The whole thing is one POST to
 * agent-media's canvas, authorised by the Audiobookshelf token this client
 * already holds; nothing new is stored on the device.
 *
 * Docked at the foot of the conversation page, where the composer of every
 * chat app is: that says what it is for, so it needs no title. The one thing
 * worth a line is that the session behind it has ended.
 */

interface ReplyBoxProps {
  libraryItemId: string
  token: string
  /** Whether the session behind this conversation is still running. */
  live: boolean
  /** Claude Code's suggested next line, from the log's poll. */
  suggestion: string
  /** A reply was accepted: the log shows the indicator and polls fast. */
  onReplied: () => void
  /** A reply reopened an ended session, or told us which pane it is in. */
  onSessionChanged: (live: boolean, pane: string | null) => void
}

/** Six rows is where a reply stops being a reply; after that it scrolls. */
const MAX_ROWS_PX = 6 * 24 + 16

export default function ReplyBox({ libraryItemId, token, live, suggestion, onReplied, onSessionChanged }: ReplyBoxProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const dictation = useDictation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  const [pane, setPane] = useState<string | null>(null)

  // Only an empty box shows the ghost, as on the terminal. An ended session
  // has no screen to read, but the server keeps a follow-up of its own for
  // the last reply, so the ghost is not tied to `live`.
  const ghost = !text && !sending ? (suggestion || '').trim() : ''

  const grow = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
  }, [])

  const send = useCallback(async () => {
    // The field's own value, not the bound one. React state lags while a soft
    // keyboard is still composing the current word, and Gboard keeps the last
    // word in composition until a space follows it — so a reply sent straight
    // after its last word lost that word ("yeah maybe we should tighten
    // the"). The textarea itself has it all.
    const typed = (inputRef.current?.value ?? text).trim()
    if (!typed || sending) return
    setSending(true)
    setStatus('')
    setFailed(false)
    setPane(null)
    try {
      const res = await canvasRequest<ReplyResponse>('POST', '/reply', token, { item: libraryItemId, text: typed })
      setText('')
      window.setTimeout(grow, 0)
      setPane(res.pane ?? null)
      onSessionChanged(true, res.pane ?? null)
      // A revived session reads the reply once it has finished loading, which
      // can take a minute — saying "sent" there would be a small lie.
      setStatus(res.opened ? S.sessionReopened : S.sent)
      // The transcript above is a snapshot from before this reply, and the
      // reply is not in the server's answer either — the words have to be
      // rendered and published before they are a turn — so the log watches
      // for it rather than being handed it.
      onReplied()
    } catch (err) {
      setFailed(true)
      setStatus(err instanceof CanvasError || err instanceof Error ? err.message : S.sendFailed)
    }
    setSending(false)
  }, [grow, libraryItemId, onReplied, onSessionChanged, sending, text, token])

  const dictate = useCallback(() => {
    dictation.listen((heard) => {
      setText((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard))
      window.setTimeout(grow, 0)
    })
  }, [dictation, grow])

  const acceptGhost = useCallback(() => {
    if (!ghost) return
    setText(ghost)
    window.setTimeout(() => {
      grow()
      inputRef.current?.focus()
    }, 0)
  }, [ghost, grow])

  const goToPane = useCallback(async () => {
    if (!pane) return
    try {
      await canvasRequest('POST', '/focus', token, { pane })
    } catch (err) {
      console.error('[Sasonica] focus failed', err)
    }
  }, [pane, token])

  return (
    <div className="border-border bg-bg w-full border-t px-3 pt-2 pb-3">
      {!live && <p className="text-foreground-muted pb-1 text-xs">{S.sessionEnded}</p>}

      {/* The ghost prompt. On the terminal it is dim text in the input box,
          taken with Tab; here it is the placeholder, and this row is the Tab:
          a click puts the words in the box to send or edit. It shows only
          while the box is empty, as the ghost does. */}
      {ghost ? (
        <div className="flex cursor-pointer items-center pb-1" onClick={acceptGhost}>
          <span className="material-symbols text-foreground-muted text-base">keyboard_tab</span>
          <p className="text-foreground-muted grow truncate px-1 text-xs italic">{ghost}</p>
          <p className="text-info shrink-0 pl-2 text-xs">{S.useSuggestion}</p>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {/* A plain textarea rather than the shared TextInput: this one has to
            grow, and that one is an <input> used by every other screen. One
            row until the text needs more, then up to six, then it scrolls.
            Enter sends; the growth comes from wrapping, not from returns. */}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          disabled={sending}
          placeholder={ghost || S.replyPlaceholder}
          onChange={(e) => {
            setText(e.target.value)
            grow()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void send()
            }
          }}
          className="bg-bg text-foreground border-border grow resize-none overflow-y-auto rounded-sm border px-2 py-2 text-sm outline-hidden"
        />
        {dictation.available && (
          <button
            type="button"
            disabled={sending}
            onClick={dictate}
            aria-label={S.dictate}
            className="bg-primary text-foreground flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`material-symbols text-xl ${dictation.listening ? 'animate-pulse' : ''}`}>mic</span>
          </button>
        )}
        <button
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
          aria-label={S.send}
          className="bg-success text-button-foreground flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`material-symbols text-xl ${sending ? 'animate-pulse' : ''}`}>send</span>
        </button>
      </div>

      {status ? (
        <div className="mt-1.5 flex items-center">
          <p className={`text-xs ${failed ? 'text-error' : 'text-foreground-muted'}`}>{status}</p>
          {pane ? (
            <button type="button" onClick={() => void goToPane()} className="text-info cursor-pointer pl-2 text-xs underline">
              {S.goToPane(pane)}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
