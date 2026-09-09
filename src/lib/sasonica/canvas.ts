/**
 * Sasonica: talking to agent-media's canvas.
 *
 * A conversation in this library is a Claude Code session someone recorded.
 * agent-media publishes it — the turns, whether the session is still running,
 * a way to put a line back into it — from a small server that lives beside
 * Audiobookshelf on port 8781. Everything here is one fetch to that server,
 * authorised by the Audiobookshelf token this client already holds: the canvas
 * hands it straight back to ABS's /api/authorize to ask who we are, so the
 * browser carries no secret of ours and nothing new is stored on the device.
 *
 * These calls go out from the BROWSER rather than through Next's own proxy on
 * purpose. The canvas is not Audiobookshelf and is not always reachable from
 * wherever the web server happens to run; the client is the thing that knows
 * the address, and the address is a per-device setting.
 */

/** The canvas's port. The clip server is 8780; this is the one beside it. */
const CANVAS_PORT = '8781'

/**
 * Where a device was told the canvas is, when the default is wrong — ABS
 * behind a proxy on a different host, or a canvas somewhere else entirely.
 * Read here, written by Settings.
 */
const OVERRIDE_KEY = 'sasonica.canvasUrl'

/**
 * The canvas address: whatever this device was told, else this page's own
 * host on 8781, which is where it is when Audiobookshelf and agent-media are
 * the same machine — the case this is built for.
 */
export function canvasBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    const set = window.localStorage.getItem(OVERRIDE_KEY)
    if (set) return set.replace(/\/+$/, '')
  } catch {
    // Private browsing, or storage blocked. The default still works.
  }
  try {
    const url = new URL(window.location.origin)
    url.port = CANVAS_PORT
    return url.origin
  } catch {
    return ''
  }
}

export function setCanvasBaseUrl(url: string) {
  try {
    if (url.trim()) window.localStorage.setItem(OVERRIDE_KEY, url.trim().replace(/\/+$/, ''))
    else window.localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    // Nothing to be done; the default address stands.
  }
}

/**
 * A canvas refusal carries the server's own words about why — and sometimes
 * more than words: a 300 from /ask means "which conversation?" and brings the
 * candidates with it, so the whole payload is kept.
 */
export class CanvasError extends Error {
  status: number
  payload: Record<string, unknown>
  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message)
    this.name = 'CanvasError'
    this.status = status
    this.payload = payload
  }
}

export async function canvasRequest<T>(method: 'GET' | 'POST', path: string, token: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const base = canvasBaseUrl()
  if (!base) throw new CanvasError('No canvas address', 0)

  const res = await fetch(`${base}${path}`, {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  let payload: Record<string, unknown> = {}
  try {
    payload = await res.json()
  } catch {
    // A canvas that fell over mid-answer, or something else on that port.
  }
  if (!res.ok || payload.ok === false) {
    // Prefer what the server said: "not a conversation", "not allowed to
    // reply", "session has gone" all read better than a status code.
    throw new CanvasError(String(payload.error || res.statusText || 'Canvas request failed'), res.status, payload)
  }
  return payload as T
}

/** Canvas-relative (/img/…) or absolute, as the server chose to send it. */
export function canvasPictureUrl(src: string): string {
  return src.startsWith('/') ? `${canvasBaseUrl()}${src}` : src
}

/** GET /conversation?item= — is this item a conversation I may reply to. */
export interface ConversationState {
  ok: boolean
  /** Running right now, in a tmux pane on the host. */
  live: boolean
  /** The pane it runs in, when it is live: somewhere to be sent. */
  pane: string | null
  session: string | null
  /** Ended, but its transcript is still on disk: a reply would reopen it. */
  resumable: boolean
}

/** One turn, and the live tail's extras. */
export interface ConversationLine {
  who: 'you' | string
  text: string
  /** Where the turn starts in the recorded audio; absent on the live tail. */
  start?: number | null
  /** A slash command reads as the command it is, not as a sentence. */
  command?: { text: string } | null
  /** A multiple-choice question that was put to the listener. */
  ask?: { question: string; options: { label: string; description?: string }[] }[] | null
  images?: string[] | null
  /** A drawn figure gets the width; ambient artwork stays small. */
  figure?: boolean
  /** Being spoken right now, by the host rather than by the player. */
  live?: boolean
  sentences?: string[] | null
  /** Where each sentence starts, in seconds from the turn's first word. */
  offsets?: number[] | null
  /** Seconds since the clip was sent, when the server last looked. */
  elapsed?: number | null
  /** How long after sending the words are actually heard, on this target. */
  delay?: number | null
  /** The server's own idea of which sentence is in the air. */
  sentence?: number | null
  /** Whether the offsets were measured or apportioned by characters. */
  measured?: boolean
  paused?: boolean
  target?: string | null
}

export interface ConversationLogResponse {
  ok: boolean
  lines: ConversationLine[]
  /** The last thing said was the listener's: an answer is still to come. */
  pending?: boolean
  /** Claude Code's suggested next line, scraped off the session's screen. */
  suggestion?: string
}

export interface ReplyResponse {
  ok: boolean
  pane?: string | null
  /** The session had ended and was reopened; it reads the reply once loaded. */
  opened?: boolean
}

/** One row of the picker: a live session, or a conversation on the shelf. */
export interface SessionRow {
  session: string
  title: string
  live: boolean
  pane?: string | null
  /** When it was last written to; only on shelved ones. */
  at?: number
}

export interface ConversationsResponse {
  ok: boolean
  sessions: SessionRow[]
}

/**
 * POST /ask — words to a session, which one being the server's decision.
 *
 * `mode` says what it did: `new` opened a fresh session, `continued` put the
 * words into an existing one, `switched` means the words were only a name so
 * nothing was sent. `how` says why it chose that: picked here, spoken in the
 * words, the conversation in the player, the last one spoken to, or default.
 * With `dry` it decides and reports without sending.
 */
export interface AskRequest {
  text: string
  /** A session id, or "new" to force a fresh one. Empty lets the server choose. */
  target?: string
  /** The conversation in the player, if any: one of the routing candidates. */
  player_item?: string
  /** The last session this device spoke to: the fallback candidate. */
  sticky?: string
  /** Read the words for a name ("reply to drones, …"). Off when one is picked. */
  parse?: boolean
  dry?: boolean
}

export interface AskResponse {
  ok: boolean
  mode: 'new' | 'continued' | 'switched'
  how?: string
  session?: string | null
  title?: string
  /** The library item for that session, once there is one. */
  item?: string | null
  /** The words as the server read them — a spoken name is taken off the front. */
  text?: string
  pane?: string | null
  /** The session had ended and was reopened. */
  opened?: boolean
}

/** GET /conversation?session= — where a session started here has got to. */
export interface SessionProgress {
  ok: boolean
  session: string
  item: string | null
  /** The library has the folder and is still building the item. */
  scanning: boolean
  live: boolean
  pane: string | null
  resumable: boolean
}
