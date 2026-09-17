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
  // The Conversations library's word for a series — see lib/sasonica/conversations.
  projects: 'Projects',

  // Settings (per device, not per account)
  settingsHeading: 'Sasonica',
  settingsCanvasLabel: 'agent-media canvas',
  settingsCanvasHelp: 'Where to send replies typed under a conversation. Blank uses this server on port 8781.',
  settingsTimingLabel: 'Follow-along timing readout',
  settingsTimingHelp: "Under a reply being spoken: the server's sentence, the timeline's, and how far apart they are. For tuning the playout delay.",

  // Live shelf and session controls
  liveShelf: 'Live',
  sessionRunning2: 'session running',
  resumeSession: 'Resume session',
  closeSession: 'Close session',
  goToTerminal: 'Go to terminal',
  sessionMenu: 'Session',
  sessionGone: 'The session is gone.',
  sessionReopenedShort: 'Session reopened.',
  sessionAlreadyRunning: 'Session is already running.',
  sessionClosed: 'Session closed.',
  sessionWasNotRunning: 'Session was not running.',
  sessionActionFailed: (action: string) => `Could not ${action} the session.`,

  play: 'Play',
  pause: 'Pause',

  // New chat
  newChat: 'New chat',
  askTo: 'To',
  askLastLabel: (title: string) => `${title} (last)`,
  askPlaceholder: 'What shall we talk about?',
  askHint:
    'Say or type what you want to talk about. Start with a conversation\u2019s name to continue it \u2014 \u201creply to drones, \u2026\u201d \u2014 or \u201cnew chat\u201d to force a fresh one.',
  askNoCanvas: 'No agent-media canvas is set \u2014 see Settings.',
  askWhich: 'Which conversation?',
  askNothingToPick: 'Nothing to pick from yet.',
  askSending: 'Sending\u2026',
  askSendingTo: 'Sending to',
  askIn: (seconds: number) => `in ${seconds}\u2026`,
  askChange: 'Change',
  askSendNow: 'Send now',
  askWaiting: 'Session open \u2014 waiting for the first reply\u2026',
  askScanning: 'Reply shelved \u2014 the library is scanning it\u2026',
  askEndedUnshelved: 'The session ended before it was shelved.',
  askNoItemYet: 'Still no item for it; it will appear in the library once it has spoken.',
  askSwitched: (title: string) => `Switched to ${title}.`,
  askSentTo: (title: string, reopened: boolean) => `Sent to ${title}${reopened ? ' (reopened)' : ''}.`,
  askSentToHost: (where: string) => `Sent to ${where}.`,
  askMeantNew: 'Meant a new chat? Send it there instead',
  askFailed: 'Could not send that.'
}
