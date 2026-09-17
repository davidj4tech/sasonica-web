/**
 * Sasonica: the Conversations library, and why its shelves use a different word.
 *
 * A conversation's *series* is the project workspace it was recorded in,
 * numbered by date — agent-media fills that field because series is the one
 * Audiobookshelf grouping that sorts itself. So "Series" in the nav is the
 * storage word showing through, and on that library the shelf is Projects.
 *
 * Book libraries keep Series, which is what they actually have. The interface
 * is shared and stays shared: this only chooses a word, at the point the word
 * is displayed — the same thing upstream already does for podcast libraries,
 * where an item is an Episode rather than a Book.
 *
 * Detection is the library's name, matching `ABS_LIBRARY_CONVERSATIONS` in
 * agent-media's config and the phone app's own rule
 * (`getCurrentLibraryIsConversations`), so the two clients cannot disagree.
 * Rename the library and this constant is the one thing to change.
 */
export const CONVERSATIONS_LIBRARY_NAME = 'conversations'

export function isConversationsLibrary(name: string | null | undefined): boolean {
  return (name || '').trim().toLowerCase() === CONVERSATIONS_LIBRARY_NAME
}
