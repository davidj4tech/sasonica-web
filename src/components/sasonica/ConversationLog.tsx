'use client'

import { ConversationLine, canvasPictureUrl } from '@/lib/sasonica/canvas'
import { S } from '@/lib/sasonica/strings'
import { LiveTiming } from '@/hooks/sasonica/useConversationLog'
import { secondsToTimestamp } from '@/lib/datefns'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Sasonica: the conversation as a chat log.
 *
 * The chapters table answers "where am I" — one sentence per turn, which is
 * what a table of contents is for. It cannot answer "what was said", and on a
 * conversation that is the more interesting question. Same rows, read instead
 * of heard: the server joins the manifest to speech history and hands back
 * whole turns with their positions, so nothing here is a second copy of
 * anything.
 *
 * This IS the scrolling area of the conversation page: always open, opening at
 * the newest turn, following the one being spoken. (The app also has a
 * collapsible variant for the book-shaped page it started as; here the
 * conversation page replaces that page outright, so there is one shape.)
 */

// How long a scroll by the reader holds off the automatic ones — following
// the spoken line, jumping to a new turn. Long enough to read back through
// something; short enough that the page catches up on its own.
const USER_SCROLL_HOLD_MS = 8000
// How close to the bottom counts as "at the bottom", so a new turn landing
// keeps the view pinned there rather than growing off-screen.
const NEAR_BOTTOM_PX = 80

interface ConversationLogProps {
  lines: ConversationLine[]
  error: string
  thinking: boolean
  liveIndex: number
  liveSentence: number
  timing: LiveTiming | null
  /** Settings → follow-along timing readout. */
  debug?: boolean
  /** The player's clock, and whether it is this conversation in the player. */
  currentTime: number
  following: boolean
  onPlayAtTimestamp: (time: number) => void
}

/**
 * Which option was taken. The answer is not stored on the question — it is the
 * listener's own turn, recorded when the choice was made — so the line below
 * is the answer, and a multi-select one lists its labels.
 */
function answerFor(lines: ConversationLine[], index: number): string[] {
  const next = lines[index + 1]
  if (!next || next.who !== 'you') return []
  return String(next.text || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function timingReadout(timing: LiveTiming, timeline: number): string {
  const { server, offsets, raw, delay, heard, pollAge, measured, target, paused } = timing
  // Where the server's sentence starts on the timeline, and how far past it
  // the corrected clock is: the bold's lead over the voice, if the server's
  // index is the truth.
  const serverStart = server >= 0 && offsets[server] != null ? offsets[server] : null
  const lead = serverStart == null ? null : heard - serverStart
  const nextStart = timeline + 1 < offsets.length ? offsets[timeline + 1] : null
  const agreement = server === timeline ? 'agree' : timeline > server ? `bold AHEAD by ${timeline - server}` : `bold behind by ${server - timeline}`
  return [
    `server #${server}  timeline #${timeline}  ${agreement}`,
    `elapsed ${raw.toFixed(2)}s  −delay ${delay.toFixed(2)}s  = ${heard.toFixed(2)}s   poll age ${pollAge.toFixed(1)}s`,
    `server sentence starts ${serverStart == null ? '?' : serverStart.toFixed(2) + 's'}  → clock is ${lead == null ? '?' : (lead >= 0 ? '+' : '') + lead.toFixed(2) + 's'} into it${nextStart == null ? '' : '; next at ' + nextStart.toFixed(2) + 's'}`,
    `offsets ${measured ? 'measured' : 'apportioned by characters'}  target ${target}  ${paused ? 'paused' : ''}`
  ].join('\n')
}

export default function ConversationLog({
  lines,
  error,
  thinking,
  liveIndex,
  liveSentence,
  timing,
  debug = false,
  currentTime,
  following,
  onPlayAtTimestamp
}: ConversationLogProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([])

  // The reader's last scroll, and whether they were at the bottom when they
  // stopped; a scroll this component started is ignored until the stamp
  // passes, or it would count as the reader's.
  const lastUserScrollAt = useRef(0)
  const stickToBottom = useRef(true)
  const ignoreScrollUntil = useRef(0)
  const lineCount = useRef(0)

  // "Away" means the reader has not scrolled for a while, so a scroll the
  // page makes will not fight one they are making.
  const readerIsAway = useCallback(() => Date.now() - lastUserScrollAt.current > USER_SCROLL_HOLD_MS, [])

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    if (Date.now() < ignoreScrollUntil.current) return
    lastUserScrollAt.current = Date.now()
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    ignoreScrollUntil.current = Date.now() + 800
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    stickToBottom.current = true
  }, [])

  // The line being spoken. A turn the host is speaking right now wins; it is
  // not in the audio item yet, so the player cannot be on it. Otherwise the
  // last line that starts at or before the player's clock — lines on the live
  // tail have no start and are never it.
  let activeIndex = -1
  if (liveIndex >= 0) {
    activeIndex = liveIndex
  } else if (following) {
    const t = Number(currentTime) + 0.05
    lines.forEach((line, i) => {
      if (line.start != null && line.start <= t) activeIndex = i
    })
  }

  // A conversation opens at its newest turn, and stays there as turns land —
  // unless the reader has scrolled up to read something, in which case the new
  // turn waits below and the page holds still.
  useEffect(() => {
    const grew = lines.length > lineCount.current
    const first = lineCount.current === 0 && lines.length > 0
    lineCount.current = lines.length
    if ((first || grew) && stickToBottom.current && readerIsAway()) scrollToBottom()
  }, [lines.length, readerIsAway, scrollToBottom])

  useEffect(() => {
    if (activeIndex < 0 || !readerIsAway()) return
    const el = lineRefs.current[activeIndex]
    if (!el) return
    ignoreScrollUntil.current = Date.now() + 800
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex, readerIsAway])

  // The bold moves down a long reply as it is read; keep it on screen. Only
  // once it has left the visible part of the scroller, and never while the
  // reader has just scrolled somewhere themselves.
  useEffect(() => {
    if (liveSentence < 0 || !readerIsAway()) return
    const el = sentenceRefs.current[liveSentence]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    const box = scroller.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    // Inside the middle band already: leave the page still.
    if (rect.top >= box.top + box.height * 0.15 && rect.bottom <= box.bottom - box.height * 0.25) return
    ignoreScrollUntil.current = Date.now() + 800
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [liveSentence, readerIsAway])

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="h-full w-full overflow-x-hidden overflow-y-auto px-3 py-3">
      {/* An empty transcript and a failed fetch are different things: the
          first says nothing was said, the second says why nothing is shown
          (the server's own words, which name the actual fault). */}
      {error && lines.length === 0 ? <p className="text-error py-8 text-center text-sm">{S.logFailed(error)}</p> : null}
      {!error && lines.length === 0 && !thinking ? <p className="text-foreground-muted py-8 text-center text-sm">{S.logEmpty}</p> : null}

      {lines.map((line, index) => {
        const answers = line.ask?.length ? answerFor(lines, index) : []
        const isChosen = (label?: string) => {
          const key = String(label || '')
            .trim()
            .toLowerCase()
          return !!key && answers.includes(key)
        }
        return (
          <div
            key={index}
            ref={(el) => {
              lineRefs.current[index] = el
            }}
            className={`mb-2 flex w-full ${line.who === 'you' ? 'justify-end' : 'justify-start'}`}
          >
            {/* The line being spoken carries a visible border; the others
                carry a transparent one of the same width so nothing shifts as
                it moves. */}
            <div
              onClick={() => line.start != null && onPlayAtTimestamp(line.start)}
              className={`max-w-[85%] rounded-lg border px-3 py-2 ${line.who === 'you' ? 'bg-info/20' : 'bg-primary/60'} ${
                index === activeIndex ? 'border-foreground/60' : 'border-transparent'
              } ${line.start != null ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center pb-0.5">
                <p className="text-foreground-muted text-xs">{line.who === 'you' ? S.speakerListener : S.speakerAssistant}</p>
                {line.start != null && <p className="text-foreground-muted pl-2 font-mono text-xs underline">{secondsToTimestamp(line.start)}</p>}
              </div>

              {/* A turn being spoken right now is shown sentence by sentence:
                  what has been said in the usual colour, the sentence in the
                  air bold, what is still to come dimmed. The server marks the
                  line live and says which sentence, refreshed every poll. */}
              {line.live && line.sentences?.length ? (
                <p className="text-sm whitespace-pre-line">
                  {line.sentences.map((sentence, i) => (
                    <span
                      key={i}
                      ref={(el) => {
                        if (index === liveIndex) sentenceRefs.current[i] = el
                      }}
                      className={i === liveSentence ? 'text-foreground font-semibold' : i < liveSentence ? 'text-foreground' : 'text-foreground-muted'}
                    >
                      {sentence}{' '}
                    </span>
                  ))}
                </p>
              ) : line.command ? (
                /* A slash command is an instruction, not a sentence: it reads
                   as the command it is, so the reply underneath has a visible
                   cause. */
                <p className="flex items-center font-mono text-sm">
                  <span className="material-symbols text-foreground-muted pr-1 text-base leading-none">terminal</span>
                  <span>{line.command.text}</span>
                </p>
              ) : line.ask?.length ? null : (
                <p className="text-sm whitespace-pre-line">{line.text}</p>
              )}

              {/* The timing readout (Settings → follow-along timing readout):
                  what the server's sentence loop says versus what this page's
                  clock says, and the gap in seconds. Positive lead = the bold
                  is ahead. */}
              {line.live && debug && timing ? (
                <p className="text-foreground-muted pt-1 font-mono text-xs whitespace-pre-line">{timingReadout(timing, liveSentence)}</p>
              ) : null}

              {/* A multiple-choice question. Spoken it is one long sentence
                  with the options run together, because a voice has no other
                  way to offer them; on a screen it is a question and a list,
                  with the option that was taken marked. The answer is the
                  listener's own bubble underneath, so this only has to show
                  what was on offer. */}
              {line.ask?.length ? (
                <div className="space-y-2">
                  {line.ask.map((question, qi) => (
                    <div key={qi}>
                      <p className="pb-1.5 text-sm whitespace-pre-line">{question.question}</p>
                      {question.options?.map((option, oi) => (
                        <div
                          key={oi}
                          className={`mb-1 flex items-start rounded border px-2 py-1 ${
                            isChosen(option.label) ? 'bg-foreground/10 border-foreground/40' : 'border-transparent bg-black/20'
                          }`}
                        >
                          <span
                            className={`material-symbols shrink-0 pr-1.5 text-sm leading-snug ${isChosen(option.label) ? 'text-success' : 'text-foreground-muted'}`}
                          >
                            {isChosen(option.label) ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className="text-xs leading-snug">
                            <span className="font-semibold">{option.label}</span>
                            {option.description && <span className="text-foreground-muted"> — {option.description}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* The picture the canvas drew for this reply, when it still has
                  it. A figure was drawn to be read and gets the width; ambient
                  artwork is kept small so it decorates rather than interrupts. */}
              {line.images?.length ? (
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {line.images.map((src) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={src}
                      src={canvasPictureUrl(src)}
                      alt=""
                      loading="lazy"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(canvasPictureUrl(src), '_blank', 'noopener')
                      }}
                      className={
                        line.figure ? 'max-h-72 w-full cursor-pointer rounded bg-black/40 object-contain' : 'h-20 w-20 cursor-pointer rounded object-cover'
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}

      {/* The thinking line. Shown while the last thing said was the
          listener's (server `pending`) or a reply has just been accepted and
          no turn has rendered yet (local `awaiting`). It is not a real line —
          it carries no position and cannot be tapped — so it is kept out of
          the lines list and drawn on its own. */}
      {thinking ? (
        <div className="mb-2 flex w-full justify-start">
          <div className="bg-primary/60 max-w-[85%] rounded-lg border border-transparent px-3 py-2">
            <p className="text-foreground-muted pb-0.5 text-xs">{S.speakerAssistant}</p>
            {/* Three pulsing dots, staggered. Tailwind's own animation and
                arbitrary delays rather than a stylesheet, so the fork adds no
                CSS to a file upstream owns. */}
            <p className="flex items-center gap-1">
              <span className="bg-foreground inline-block size-1.5 animate-pulse rounded-full opacity-40" />
              <span className="bg-foreground inline-block size-1.5 animate-pulse rounded-full opacity-40 [animation-delay:0.2s]" />
              <span className="bg-foreground inline-block size-1.5 animate-pulse rounded-full opacity-40 [animation-delay:0.4s]" />
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
