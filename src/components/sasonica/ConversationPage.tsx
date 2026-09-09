'use client'

import ConversationLog from '@/components/sasonica/ConversationLog'
import ReplyBox from '@/components/sasonica/ReplyBox'
import { useConversationLog } from '@/hooks/sasonica/useConversationLog'
import { ConversationSession } from '@/hooks/sasonica/useConversationSession'
import { usePlayerProgress } from '@/lib/player/playerProgressStore'
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

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {session.live && <span className="bg-success size-2 shrink-0 rounded-full" title={S.sessionRunning} />}
        <h1 className="grow truncate text-base font-semibold">{libraryItem.media.metadata.title}</h1>
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
