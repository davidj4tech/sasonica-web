'use client'

import { fetchLibraryItemsAction } from '@/app/actions/libraryActions'
import { S } from '@/lib/sasonica/strings'
import type { LibraryItem, PersonalizedShelf } from '@/types/api'
import { useEffect, useState } from 'react'

/**
 * Sasonica: the Live shelf — conversations whose session is running right now.
 *
 * agent-media tags an item `live` while its Claude Code session is up and
 * takes the tag off when it ends, so this is a plain Audiobookshelf filter
 * rather than anything that needs the canvas. Null when there are none, so on
 * an ordinary library — and on a quiet day — the home page is exactly as
 * upstream left it.
 *
 * Polled, because the whole point is that it changes while you are looking at
 * it. Only while the tab is visible: a backgrounded tab asking every half
 * minute for a shelf nobody can see is waste.
 */

// base64 of "live" — Audiobookshelf's filter syntax is `tags.<base64 value>`.
const LIVE_FILTER = 'tags.bGl2ZQ=='
const POLL_MS = 30000

export function useLiveShelf(libraryId: string, mediaType: string | undefined): PersonalizedShelf | null {
  const [shelf, setShelf] = useState<PersonalizedShelf | null>(null)

  useEffect(() => {
    if (!libraryId || mediaType !== 'book') return
    let cancelled = false
    let timer: number | null = null

    const load = async () => {
      try {
        const query = `filter=${encodeURIComponent(LIVE_FILTER)}&sort=updatedAt&desc=1&limit=20&minified=1`
        const res = await fetchLibraryItemsAction(libraryId, query)
        if (cancelled) return
        const entities = (res?.results || []) as LibraryItem[]
        setShelf(entities.length ? { id: 'sasonica-live', label: S.liveShelf, labelStringKey: '', type: 'book', entities, total: entities.length } : null)
      } catch (error) {
        // A shelf that cannot be fetched is a shelf that is not shown; the
        // rest of the home page is none of its business.
        console.error('[Sasonica] live shelf failed', error)
        if (!cancelled) setShelf(null)
      }
    }

    const schedule = () => {
      if (document.hidden) return
      timer = window.setTimeout(tick, POLL_MS)
    }
    const tick = async () => {
      timer = null
      await load()
      if (!cancelled) schedule()
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
      } else {
        void load()
        schedule()
      }
    }

    void load()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [libraryId, mediaType])

  return shelf
}
