/**
 * Sasonica: the last conversation this device spoke to.
 *
 * One of the candidates the server routes by: with nothing picked, no name in
 * the words and nothing in the player, "new chat" would be the wrong guess
 * for someone who is plainly still in the middle of a conversation. Kept per
 * device, because it is about this screen's train of thought and not about
 * the account.
 */

const KEY = 'sasonica.askLast'

export interface AskLast {
  session: string
  title: string
}

export function getAskLast(): AskLast | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AskLast
    return parsed?.session ? parsed : null
  } catch {
    return null
  }
}

export function setAskLast(last: AskLast) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(last))
  } catch {
    // Nothing to be done; the next ask just has one candidate fewer.
  }
}
