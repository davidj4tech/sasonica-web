import NewChat from '@/components/sasonica/NewChat'

/**
 * Sasonica: start a conversation.
 *
 * Under the library rather than at the top level because a conversation that
 * gets going becomes an item in this library, and this page then goes there —
 * which needs the library's id in the URL.
 */
export default async function AskPage({ params }: { params: Promise<{ library: string }> }) {
  const { library } = await params
  return <NewChat libraryId={library} />
}
