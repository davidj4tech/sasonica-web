'use client'

import { useDictation } from '@/hooks/sasonica/useDictation'
import { useMediaContext } from '@/contexts/MediaContext'
import { useUser } from '@/contexts/UserContext'
import { AskLast, getAskLast, setAskLast } from '@/lib/sasonica/askLast'
import { AskRequest, AskResponse, CanvasError, SessionProgress, SessionRow, canvasBaseUrl, canvasRequest } from '@/lib/sasonica/canvas'
import { S } from '@/lib/sasonica/strings'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Sasonica: a new conversation.
 *
 * The words typed (or dictated) here become the first message of a FRESH
 * Claude Code session on the host — agent-media opens it in the scratch tmux
 * session — and the page then waits for the library to grow an item for that
 * session, which happens once its first turn is shelved, and moves to it.
 * Same credential as a reply: the Audiobookshelf token.
 *
 * Or not fresh at all. Where the words go is the server's decision, from what
 * is picked here, a name at the start of the words ("reply to drones, …"),
 * the conversation in the player, and the last one this device spoke to, in
 * that order. It reports which it chose, and this page asks first — a dry run
 * — whenever the choice was a guess, because words put into the wrong
 * conversation cannot be taken back out.
 *
 * (The app also lands here from the assistant button, which sends the moment
 * dictation returns: a button pressed to say something should not then want a
 * tap. That intent is Android-only; typing waits for send.)
 */

// How long to wait for the library to show the new conversation. The first
// turn is exported a minute after it is spoken, then Audiobookshelf has to
// notice the folder; five minutes covers a slow first reply.
const ITEM_WAIT_MS = 5 * 60 * 1000
const ITEM_POLL_MS = 3000
// How long a guessed destination waits before it goes. Long enough to read
// the sentence and stop it, short enough not to be a dialog.
const CONFIRM_SECONDS = 4
/** Six rows is where a message stops being a message; after that it scrolls. */
const MAX_ROWS_PX = 6 * 24 + 16

interface Destination {
  session: string
  title: string
}

interface PendingConfirm extends Destination {
  text: string
}

export default function NewChat({ libraryId }: { libraryId: string }) {
  const { token } = useUser()
  const { libraryItemIdStreaming } = useMediaContext()
  const dictation = useDictation()
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const [baseUrl, setBaseUrl] = useState('')
  const [text, setText] = useState('')
  const [sentText, setSentText] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  const [pane, setPane] = useState<string | null>(null)

  // Routing: what is picked here, the last thread spoken to, and the picker's
  // rows — the server's whole list, or the candidates it could not choose
  // between.
  const [target, setTarget] = useState<Destination | null>(null)
  const [sticky, setSticky] = useState<AskLast | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerRows, setPickerRows] = useState<SessionRow[]>([])
  const [ambiguous, setAmbiguous] = useState(false)

  // After sending: the session it went to, whether that was an existing one,
  // and whether there is anything left to wait for.
  const [session, setSession] = useState<string | null>(null)
  const [continued, setContinued] = useState(false)
  const [settled, setSettled] = useState(false)

  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [countdown, setCountdown] = useState(0)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    setBaseUrl(canvasBaseUrl())
    setSticky(getAskLast())
    inputRef.current?.focus()
    return () => {
      if (pollRef.current !== null) window.clearTimeout(pollRef.current)
    }
  }, [])

  const grow = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
  }, [])

  const itemHref = useCallback((item: string) => `/library/${libraryId}/item/${item}`, [libraryId])

  // Wait for the library to grow an item for a session just opened, and go
  // there when it does.
  const poll = useCallback(
    async (sessionId: string, until: number) => {
      try {
        const res = await canvasRequest<SessionProgress>('GET', `/conversation?session=${encodeURIComponent(sessionId)}`, token)
        if (res.item) {
          router.replace(itemHref(res.item))
          return
        }
        if (res.pane) setPane(res.pane)
        // `scanning`: the library has the folder and is still building the
        // item, so opening it now would fail. Keep waiting.
        setStatus(res.scanning ? S.askScanning : res.live ? S.askWaiting : S.askEndedUnshelved)
      } catch (err) {
        console.error('[Sasonica] ask poll failed', err)
      }
      if (Date.now() < until) {
        pollRef.current = window.setTimeout(() => void poll(sessionId, until), ITEM_POLL_MS)
      } else {
        setStatus(S.askNoItemYet)
      }
    },
    [itemHref, router, token]
  )

  const onSent = useCallback(
    (res: AskResponse, typed: string) => {
      setSentText(res.text || typed)
      setText('')
      setPane(res.pane ?? null)
      setSession(res.session || '?')
      setContinued(res.mode === 'continued')

      if (res.mode === 'switched') {
        // A name and nothing else: go there, and make it the thread the next
        // message continues.
        const last = { session: res.session || '', title: res.title || '' }
        setAskLast(last)
        setSticky(last)
        if (res.item) {
          router.replace(itemHref(res.item))
          return
        }
        setSession(null)
        setTarget(last)
        setStatus(S.askSwitched(res.title || 'that conversation'))
        return
      }

      if (res.mode === 'continued') {
        const last = { session: res.session || '', title: res.title || '' }
        setAskLast(last)
        setStatus(S.askSentTo(res.title || 'the conversation', !!res.opened))
        if (res.item) {
          router.replace(itemHref(res.item))
          return
        }
        setSettled(true)
        return
      }

      if (res.session && res.session !== '?') {
        setAskLast({ session: res.session, title: '' })
        setStatus(S.askWaiting)
        void poll(res.session, Date.now() + ITEM_WAIT_MS)
        return
      }

      // Delivered, but the session's id never surfaced: nothing to wait for
      // here. The pane link is the way to it.
      setSettled(true)
      setStatus(S.askSentToHost(res.pane || 'the host'))
    },
    [itemHref, poll, router]
  )

  /**
   * `to` overrides what is picked, `words` what is typed — both passed
   * explicitly rather than read back from state, so a send that follows a
   * decision made in the same breath (a confirmed guess, a picked candidate)
   * does not race the re-render that would carry it.
   */
  const send = useCallback(
    async ({ forceNew = false, to, words }: { forceNew?: boolean; to?: Destination | null; words?: string } = {}) => {
      // The field's own value, not the bound one: a soft keyboard holds the
      // last word in composition until a space follows it (see ReplyBox).
      const typed = (words ?? inputRef.current?.value ?? text).trim()
      const destination = to === undefined ? target : to
      if (!typed || sending) return
      setSending(true)
      setFailed(false)
      setPickerOpen(false)
      setStatus(S.askSending)

      const body: AskRequest = {
        text: typed,
        target: destination ? destination.session : forceNew ? 'new' : '',
        player_item: libraryItemIdStreaming || '',
        sticky: sticky?.session || '',
        // A picked destination is the answer; the words are not read for one.
        parse: !destination && !forceNew
      }

      // 300: the spoken name fits more than one conversation. Nothing was
      // sent; the candidates become the picker and the words stay put.
      const asPicker = (err: unknown): boolean => {
        if (!(err instanceof CanvasError) || err.status !== 300) return false
        const rows = (err.payload.ambiguous as SessionRow[]) || []
        setText(String(err.payload.text || typed))
        setPickerRows(rows)
        setAmbiguous(true)
        setPickerOpen(true)
        setStatus('')
        return true
      }

      try {
        // When the server would be guessing — nothing picked, no forced new
        // chat — ask where the words WOULD go first. A fresh session needs no
        // nod; a guessed thread gets a countdown that can be stopped.
        if (body.parse) {
          const dry = await canvasRequest<AskResponse>('POST', '/ask', token, { ...body, dry: true })
          if (dry.mode === 'switched') {
            onSent(dry, typed)
            setSending(false)
            return
          }
          if (dry.mode === 'continued' && dry.session) {
            setSending(false)
            setStatus('')
            setConfirm({ session: dry.session, title: dry.title || 'that conversation', text: dry.text || typed })
            setCountdown(CONFIRM_SECONDS)
            return
          }
          // A fresh session: commit as asked, with the trimmed words.
          body.text = dry.text || typed
          body.target = 'new'
          body.parse = false
        }
        const res = await canvasRequest<AskResponse>('POST', '/ask', token, body)
        onSent(res, typed)
      } catch (err) {
        if (!asPicker(err)) {
          setFailed(true)
          setStatus(err instanceof Error ? err.message : S.askFailed)
        }
      }
      setSending(false)
    },
    [libraryItemIdStreaming, onSent, sending, sticky?.session, target, text, token]
  )

  // The countdown on a guessed destination.
  useEffect(() => {
    if (!confirm) return
    if (countdown <= 0) {
      const pending = confirm
      setConfirm(null)
      setTarget({ session: pending.session, title: pending.title })
      void send({ to: { session: pending.session, title: pending.title }, words: pending.text })
      return
    }
    const id = window.setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => window.clearTimeout(id)
  }, [confirm, countdown, send])

  const openPicker = useCallback(async () => {
    setAmbiguous(false)
    setPickerOpen(true)
    try {
      const res = await canvasRequest<{ sessions: SessionRow[] }>('GET', '/conversations', token)
      setPickerRows(res.sessions || [])
    } catch {
      setPickerRows([])
    }
  }, [token])

  const pick = useCallback(
    (row: SessionRow | null) => {
      const answering = ambiguous
      // "New chat" picked outright forces a fresh session, over the player
      // and the last thread alike.
      const destination: Destination = row ? { session: row.session, title: row.title } : { session: 'new', title: S.newChat }
      setTarget(destination)
      setPickerOpen(false)
      setAmbiguous(false)
      // Picked to answer "which conversation?": the words are ready, send.
      if (row && answering && text.trim()) void send({ to: destination })
    },
    [ambiguous, send, text]
  )

  const goToPane = useCallback(async () => {
    if (!pane) return
    try {
      await canvasRequest('POST', '/focus', token, { pane })
    } catch (err) {
      console.error('[Sasonica] focus failed', err)
    }
  }, [pane, token])

  // The server routed the words to an existing thread and that was wrong:
  // send the same words to a fresh session. The first copy stays where it
  // went — typed words cannot be untyped.
  const sendAsNew = useCallback(() => {
    const words = sentText
    setSession(null)
    setContinued(false)
    setSettled(false)
    setTarget(null)
    setText(words)
    void send({ forceNew: true, to: null, words })
  }, [send, sentText])

  const destinationLabel = target ? target.title : sticky ? S.askLastLabel(sticky.title) : S.newChat

  return (
    <div className="bg-bg flex h-full w-full flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="material-symbols text-foreground-muted text-xl">add_comment</span>
        <h1 className="grow truncate text-base font-semibold">{S.newChat}</h1>
      </div>

      {/* Where the words go. "New chat" unless a conversation is picked here,
          named at the start of the words, loaded in the player, or was the
          last one spoken to; the server decides in that order. */}
      {baseUrl && !session && (
        <button
          type="button"
          onClick={() => void openPicker()}
          className="border-border flex shrink-0 cursor-pointer items-center border-b px-3 py-2 text-left"
        >
          <span className="text-foreground-muted text-xs">{S.askTo}</span>
          <span className={`grow truncate px-2 text-sm ${target ? '' : 'text-foreground-muted'}`}>{destinationLabel}</span>
          <span className="material-symbols text-foreground-muted text-lg">expand_more</span>
        </button>
      )}

      <div className="min-h-0 grow overflow-y-auto px-3 py-4">
        {!baseUrl ? (
          <p className="text-error text-sm">{S.askNoCanvas}</p>
        ) : pickerOpen ? (
          <>
            {ambiguous ? (
              <p className="text-foreground-muted pb-2 text-sm">{S.askWhich}</p>
            ) : (
              <button type="button" onClick={() => pick(null)} className="border-border flex w-full cursor-pointer items-center border-b py-2 text-left">
                <span className="material-symbols text-foreground-muted text-lg">add_comment</span>
                <span className="pl-2 text-sm">{S.newChat}</span>
              </button>
            )}
            {pickerRows.map((row) => (
              <button
                key={row.session}
                type="button"
                onClick={() => pick(row)}
                className="border-border flex w-full cursor-pointer items-center border-b py-2 text-left"
              >
                <span className={`material-symbols text-lg ${row.live ? 'text-success' : 'text-foreground-muted'}`}>
                  {row.live ? 'radio_button_checked' : 'history'}
                </span>
                <span className="truncate pl-2 text-sm">{row.title}</span>
              </button>
            ))}
            {pickerRows.length === 0 && <p className="text-foreground-muted py-2 text-sm">{S.askNothingToPick}</p>}
          </>
        ) : confirm ? (
          <>
            <p className="text-sm">{confirm.text}</p>
            <p className="text-foreground-muted pt-3 text-sm">
              {S.askSendingTo} <span className="text-foreground">{confirm.title}</span> {S.askIn(countdown)}
            </p>
            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => {
                  const pending = confirm
                  setConfirm(null)
                  setText(pending.text)
                  void openPicker()
                }}
                className="bg-primary text-foreground cursor-pointer rounded-sm px-4 py-1 text-sm"
              >
                {S.askChange}
              </button>
              <button type="button" onClick={() => setCountdown(0)} className="bg-success text-button-foreground cursor-pointer rounded-sm px-4 py-1 text-sm">
                {S.askSendNow}
              </button>
            </div>
          </>
        ) : !session ? (
          <p className="text-foreground-muted text-sm">{S.askHint}</p>
        ) : (
          <>
            <p className="text-sm">{sentText}</p>
            <div className="flex items-center gap-2 pt-3">
              {!settled && <span className="bg-foreground inline-block size-1.5 animate-pulse rounded-full opacity-40" />}
              <p className="text-foreground-muted text-sm">{status}</p>
            </div>
            {pane && (
              <button type="button" onClick={() => void goToPane()} className="text-info cursor-pointer pt-2 text-xs underline">
                {S.goToPane(pane)}
              </button>
            )}
            {continued && (
              <button type="button" onClick={sendAsNew} className="text-info block cursor-pointer pt-2 text-xs underline">
                {S.askMeantNew}
              </button>
            )}
          </>
        )}
        {failed && <p className="text-error pt-3 text-sm">{status}</p>}
      </div>

      {baseUrl && !session && !confirm && (
        <div className="border-border bg-bg shrink-0 border-t px-3 pt-2 pb-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              disabled={sending}
              placeholder={S.askPlaceholder}
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
                aria-label={S.dictate}
                onClick={() =>
                  dictation.listen((heard) => {
                    setText((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard))
                    window.setTimeout(grow, 0)
                  })
                }
                className="bg-primary text-foreground flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={`material-symbols text-xl ${dictation.listening ? 'animate-pulse' : ''}`}>mic</span>
              </button>
            )}
            <button
              type="button"
              disabled={!text.trim() || sending}
              aria-label={S.send}
              onClick={() => void send()}
              className="bg-success text-button-foreground flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`material-symbols text-xl ${sending ? 'animate-pulse' : ''}`}>send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
