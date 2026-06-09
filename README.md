# caleiDOS

a browser desktop where an agent builds real apps live.

you type "build me a pomodoro timer" into the prompt bar. the agent (Claude Code,
running with full file and shell access) writes a real React component to
`apps/pomodoro-timer/index.tsx` on disk. the desktop notices the new file and
opens a window rendering it. the app is real, persistent, and inspectable on
disk; it shows up in `git status`. nothing is faked or hallucinated as a throwaway
blob.

it runs in Docker so the agent's file/command access is sandboxed to the project.

## how it works

- **prompt bar** sends your request to `POST /api/build`, which runs the agent via
  `@anthropic-ai/claude-agent-sdk` with `permissionMode: "bypassPermissions"` and
  `cwd` set to `apps/`. the stream of the agent's progress (text, tool calls, file
  writes) is shown live in the build log.
- the agent follows a strict **app contract** (see `src/lib/agent-events.ts`):
  write `apps/<slug>/index.tsx` exporting a default `App` component, plus
  `apps/<slug>/meta.json`.
- **`GET /api/apps/registry`** scans `apps/` on disk and returns the app list.
  the desktop polls it (fast while building) and opens a window for each new app.
- each window renders its app through `src/app/render/[slug]`, which dynamically
  imports `apps/<slug>/index.tsx`. in `next dev` this hot-reloads when the agent
  rewrites the file.

no Anthropic API key. auth is your Claude subscription via `claude auth login`,
run once inside the container.

## prerequisites

- docker & docker compose
- a Claude subscription (for `claude auth login`)

## quick start

1. build and start:
```bash
docker compose up --build
```

2. log in to Claude **inside the container** (one time; the login persists in the
   `caleidos-home` volume). in a second terminal, from this directory:
```bash
docker compose exec -it caleidos claude auth login
```
   it defaults to Claude subscription auth (no api-key billing). follow the
   printed url, authorize, paste the code back. confirm with:
```bash
docker compose exec caleidos claude auth status
```
   expecting `"loggedIn": true`.

3. open http://localhost:3000 and type something into the prompt bar, e.g.
   "build me a tip calculator".

to re-authenticate later: re-run the `claude auth login` step. to wipe the login,
`docker compose exec caleidos claude auth logout` (or remove the volume with
`docker compose down -v`).

## persistence

- **`apps/`** is bind-mounted from your checkout, so every app the agent builds
  lands on your disk and is git-tracked by default (see `.gitignore` to make them
  scratch instead).
- **`/home/caleidos`** is the named `caleidos-home` volume: your `claude auth
  login` and anything the agent writes outside the project survive
  `docker compose down`/`up`. only `docker compose down -v` discards it.

## the app contract

every app the agent builds is a directory under `apps/`:

```
apps/<slug>/
  index.tsx    "use client"; export default function App() { ... }
  meta.json    { slug, title, description, createdAt }
```

`index.tsx` may import `react`, `lucide-react`, `framer-motion`, and relative
files inside its own directory. the root element uses
`className="w-full h-full overflow-auto"`; the window frame handles outer sizing.

## safety

the agent runs with `bypassPermissions` and has real shell + file access. that is
the point: it genuinely builds and acts. it is contained because:

- only this project directory is bind-mounted into the container; no other host
  paths are exposed.
- no docker socket is mounted, so it cannot reach the host docker daemon.
- it runs as a non-root user matching your uid/gid.

it can still make outbound network requests and write anywhere inside the project
tree. run it on code you are comfortable letting an agent modify.

## status

phase 1: the end-to-end loop works (prompt to file to window). later phases add a
richer build log, dock magnification, a menubar, window resize/minimize, and
agent session continuity across prompts.
