'use client'

import ConversationLog from '@/components/sasonica/ConversationLog'
import ReplyBox from '@/components/sasonica/ReplyBox'
import { useConversationLog } from '@/hooks/sasonica/useConversationLog'
import { ConversationSession } from '@/hooks/sasonica/useConversationSession'
import { usePlayerProgress } from '@/lib/player/playerProgressStore'
import { useCallback, useState } from 'react'
import { S } from '@/lib/sasonica/strings'
import { BookLibraryItem, PodcastLibraryItem } from '@/types/api'

/**
 * Sasonica: a conversation is a chat, and gets a chat's page.
 *
 * A title row, the transcript filling the screen, the composer at the foot.
 * The book chrome — cover, author, duration, download, progress, chapters —
 * is about a finished thing and says nothing about an exchange that is still
 * going; play/pause is kept, small, in the title row, because a conversation
 * can still be listened to.
 *
 * Everything upstream draws for an ordinary item is untouched; the item page
 * simply picks this instead when agent-media says the item is a conversation.
 */

interface ConversationPageProps {
  libraryItem: BookLibraryItem | PodcastLibraryItem
  token: string
  session: ConversationSession
  showPlayButton: boolean
  isItemPlaying: boolean
  onPlay: () => void
  onGoToTimestamp: (time: number) => void
  /** Settings → follow-along timing readout. */
  debug?: boolean
}

export default function ConversationPage({
  libraryItem,
  token,
  session,
  showPlayButton,
  isItemPlaying,
  onPlay,
  onGoToTimestamp,
  debug = false
}: ConversationPageProps) {
  const { currentTime } = usePlayerProgress()
  const log = useConversationLog(libraryItem.id, token, true)
  // The session behind this conversation: bring it back, end it, or go to the
  // pane it runs in. In the title row rather than a menu of its own — there
  // are only ever two of them, and which two depends on whether it is live.
  const [menuOpen, setMenuOpen] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('')
  const act = useCallback(
    async (action: 'resume' | 'close' | 'terminal') => {
      setMenuOpen(false)
      setSessionStatus(await session.manage(action))
    },
    [session]
  )

  return (
    /* Exactly the height of the region this page is given, so the composer
       is on screen without a scroll.
       `h-full` cannot do it: the wrapper between here and the scroll
       container has no height of its own, so a percentage resolves to
       nothing. So this mirrors `.page-wrapper` in assets/app.css, including
       the second rule that takes the media player's height off while
       something is streaming — measuring the viewport alone leaves the page a
       player-bar too tall, which is a small scroll to reach the box you want
       to type in. `dvh`, not `vh`: on a phone the two differ by the browser's
       own chrome. */
    <div className="flex h-[calc(100dvh-4rem)] flex-col [.streaming_&]:h-[calc(100dvh-4rem-var(--media-player-height,165px))]">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {session.live && <span className="bg-success size-2 shrink-0 rounded-full" title={S.sessionRunning} />}
        <h1 className="grow truncate text-base font-semibold">{libraryItem.media.metadata.title}</h1>
        {session.session && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={S.sessionMenu}
              aria-expanded={menuOpen}
              className="bg-primary text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm"
            >
              <span className="material-symbols text-xl">more_vert</span>
            </button>
            {menuOpen && (
              <div className="border-border bg-bg absolute end-0 top-9 z-30 w-48 rounded-sm border py-1 shadow-lg">
                {session.live ? (
                  <>
                    <button type="button" onClick={() => void act('terminal')} className="hover:bg-bg-hover w-full cursor-pointer px-3 py-2 text-start text-sm">
                      {S.goToTerminal}
                    </button>
                    <button type="button" onClick={() => void act('close')} className="hover:bg-bg-hover w-full cursor-pointer px-3 py-2 text-start text-sm">
                      {S.closeSession}
                    </button>
                  </>
                ) : session.resumable ? (
                  <button type="button" onClick={() => void act('resume')} className="hover:bg-bg-hover w-full cursor-pointer px-3 py-2 text-start text-sm">
                    {S.resumeSession}
                  </button>
                ) : (
                  <p className="text-foreground-muted px-3 py-2 text-sm">{S.sessionGone}</p>
                )}
              </div>
            )}
          </div>
        )}
        {showPlayButton && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={isItemPlaying ? S.pause : S.play}
            className="bg-success text-button-foreground flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm"
          >
            <span className="material-symbols fill text-xl">{isItemPlaying ? 'pause' : 'play_arrow'}</span>
          </button>
        )}
      </div>

      {sessionStatus && (
        <p className="text-foreground-muted border-border shrink-0 border-b px-3 py-1 text-xs" onClick={() => setSessionStatus('')}>
          {sessionStatus}
        </p>
      )}

      <div className="min-h-0 grow">
        <ConversationLog
          lines={log.lines}
          error={log.error}
          thinking={log.thinking}
          liveIndex={log.liveIndex}
          liveSentence={log.liveSentence}
          timing={log.timing}
          debug={debug}
          currentTime={currentTime}
          following={isItemPlaying}
          onPlayAtTimestamp={onGoToTimestamp}
        />
      </div>

      <div className="shrink-0">
        <ReplyBox
          libraryItemId={libraryItem.id}
          token={token}
          live={session.live}
          suggestion={log.suggestion}
          onReplied={log.replied}
          onSessionChanged={session.setLive}
        />
      </div>
    </div>
  )
}
