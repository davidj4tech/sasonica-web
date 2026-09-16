# Sasonica — the web client

A fork of `audiobookshelf/audiobookshelf-client-react` that adds one thing:
some items in this Audiobookshelf library are not audiobooks, they are
recorded Claude Code conversations, and this client lets you read one and
reply into the session behind it.

The companion Android app ([`davidj4tech/Sasonica`](https://github.com/davidj4tech/Sasonica),
a fork of the Vue app) has had these for a while. This is the same features on
the client upstream is replacing the Vue one with. The app's components are
the spec; their comments carry the reasons.

## What talks to what

Everything conversation-shaped is a call to **agent-media's canvas**, a small
server that lives beside Audiobookshelf on port **8781**. It is authorised by
the Audiobookshelf bearer this client already holds: the canvas hands the
token straight back to ABS's `/api/authorize` to ask who we are, so the
browser carries no secret of ours.

The calls go out from the browser, not through Next's own proxy — the canvas
is not Audiobookshelf, is not always reachable from wherever the web server
runs, and its address is a per-device setting (`sasonica.canvasUrl` in
`localStorage`; the default is this page's host on 8781).

| what | endpoint |
| --- | --- |
| is this item a conversation I may reply to | `GET /conversation?item=` |
| the turns, and the one being spoken | `GET /conversation/log?item=` |
| put a line back into the session | `POST /reply` |
| bring the desk's tmux client to its pane | `POST /focus` |

## How to hold the fork

Upstream commits daily, so merges have to stay cheap:

- **Fork logic lives in fork-only files** — `src/lib/sasonica/`,
  `src/hooks/sasonica/`, `src/components/sasonica/`.
- **Upstream files get hook-sized `// Sasonica:` blocks**, never reindented
  and never rearranged. Today that is one: the item page picks the chat page
  instead of the book chrome when the canvas says the item is a conversation.
- **The fork's English lives in `src/lib/sasonica/strings.ts`**, not in
  upstream's locale files — those are translated by other people and merged
  constantly, and keys only this fork uses would make every merge a conflict.

`sasonica` is the staging line; `master` tracks upstream (upstream's default branch
is `master`, not `main`).

## Building

```
corepack enable && pnpm i
pnpm typecheck && pnpm find-hardcoded-strings
pnpm build
```

(`pnpm lint` over the whole tree wants more memory than a small host has; it
aborts on pristine upstream too. Lint the changed paths instead.)

Run it against a server by pointing Audiobookshelf's `REACT_CLIENT_PATH` at
this checkout, or by bind-mounting it over `/app/client-react` in the
`audiobookshelf-react` container.
