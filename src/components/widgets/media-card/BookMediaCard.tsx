'use client'

import { type BookMedia, isPersonalizedSeriesRef } from '@/types/api'
import { useMemo } from 'react'
import MediaCard, { type MediaCardProps } from './MediaCard'
// Sasonica: a conversation whose session is running carries agent-media's
// `live` tag.
import { S } from '@/lib/sasonica/strings'

export type BookMediaCardProps = MediaCardProps

/**
 * Book-specific media card with book-specific badges and overlays.
 */
export default function BookMediaCard(props: BookMediaCardProps) {
  const { libraryItem } = props
  const media = libraryItem.media as BookMedia

  // Sequence badge only when the server injects a shelf `PersonalizedSeriesRef`
  // (continue-series, series-filtered rows). Minified home shelves use `seriesName` only;
  // expanded `Series[]` from socket updates must not drive this badge.
  const seriesSequence = useMemo(() => {
    const { series } = media.metadata
    if (!series || !isPersonalizedSeriesRef(series)) return null
    return series.sequence ?? null
  }, [media.metadata])

  const ebookFormat = useMemo(() => media.ebookFormat, [media])

  const renderBadges = useMemo(() => {
    const BookBadges = ({ isHovering, isSelectionMode, processing }: { isHovering: boolean; isSelectionMode: boolean; processing: boolean }) => {
      // Series sequence badge (regular, when not hovering/selecting)
      if (seriesSequence && !isHovering && !isSelectionMode && !processing) {
        return (
          <div
            cy-id="seriesSequence"
            className="shadow-modal-content absolute end-[0.375em] top-[0.375em] z-10 rounded-lg bg-black/90 text-white"
            style={{ padding: '0.1em 0.25em' }}
          >
            <p style={{ fontSize: '0.8em' }}>#{seriesSequence}</p>
          </div>
        )
      }

      return null
    }
    BookBadges.displayName = 'BookBadges'
    return BookBadges
  }, [seriesSequence])

  const renderOverlayBadges = useMemo(() => {
    const BookOverlayBadges = () => {
      // Ebook format badge at bottom-left of overlay
      if (ebookFormat) {
        return (
          <div cy-id="ebookFormat" className="absolute start-[0.375em] bottom-[0.375em]">
            <span className="text-white/80" style={{ fontSize: '0.8em' }}>
              {ebookFormat}
            </span>
          </div>
        )
      }
      return null
    }
    BookOverlayBadges.displayName = 'BookOverlayBadges'
    return BookOverlayBadges
  }, [ebookFormat])

  // Sasonica: the same green dot as the chat page's title row, so a live
  // conversation can be told apart on a shelf or a projects page. Wrapped
  // around upstream's badges rather than woven into them: the dot is always
  // shown, where those come and go with hover and selection.
  const isLive = useMemo(() => {
    const tags = (media as { tags?: string[] }).tags
    return Array.isArray(tags) && tags.includes('live')
  }, [media])

  const renderBadgesWithLive = useMemo(() => {
    if (!isLive) return renderBadges
    const WithLive = (badgeProps: { isHovering: boolean; isSelectionMode: boolean; processing: boolean }) => {
      const Badges = renderBadges
      return (
        <>
          <div
            className="bg-success shadow-modal-content absolute start-[0.5em] top-[0.5em] z-20 rounded-full"
            style={{ width: '0.65em', height: '0.65em' }}
            title={S.sessionRunning}
          />
          <Badges {...badgeProps} />
        </>
      )
    }
    WithLive.displayName = 'BookBadgesWithLive'
    return WithLive
  }, [isLive, renderBadges])

  return <MediaCard {...props} renderBadges={renderBadgesWithLive} renderOverlayBadges={renderOverlayBadges} />
}
