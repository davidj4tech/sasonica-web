/**
 * Sasonica: the fork's own words.
 *
 * Kept out of upstream's locale files on purpose. Those are translated by
 * other people and merged from upstream constantly; adding keys to them would
 * make every merge a conflict for the sake of strings only this fork uses.
 * One module instead — which is also where they go if the fork ever wants
 * real translations of its own.
 */
export const S = {
  speakerAssistant: 'Claude',
  speakerListener: 'You',
  logFailed: (why: string) => `Couldn't load the conversation: ${why}`,
  logEmpty: 'Nothing said yet.',
  sessionRunning: 'session running',
  sessionEnded: 'Session ended — a reply reopens it.',
  sessionReopened: 'Session reopened — it will pick this up shortly.',
  sent: 'Sent.',
  sendFailed: 'Could not send that.',
  useSuggestion: 'use',
  replyPlaceholder: 'Say something back…',
  dictate: 'Dictate a reply',
  send: 'Send reply',
  goToPane: (pane: string) => `go to ${pane}`,
  play: 'Play',
  pause: 'Pause'
}
