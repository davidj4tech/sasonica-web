'use client'

import { useLibraryOptional } from '@/contexts/LibraryContext'
import { isConversationsLibrary } from '@/lib/sasonica/conversations'

/**
 * Sasonica: whether the library being looked at is the conversations one.
 *
 * Optional context on purpose — the side rail is also mounted on settings and
 * account, where there is no library at all, and the answer there is no.
 */
export function useIsConversationsLibrary(): boolean {
  const { library } = useLibraryOptional()
  return isConversationsLibrary(library?.name)
}
