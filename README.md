# caleiDOS

a browser OS whose apps, widgets, and look are generated live by a model.

you name something ("calculator", "a clock widget", "set the background to a
misty forest") and caleiDOS creates it on the spot: the model writes a complete,
self-contained, interactive component, and it appears on the desktop. the
component then runs on its own, instantly, with no further model calls for
routine clicks. the model is invoked only to **create** a component, to
**change** one on request, or when a component asks the host to **fetch** fresh
data. created components are persisted, so they come back with their state after
a restart.

it runs in Docker so the model's access is sandboxed.

## how it works

- you type a request into the command bar; caleiDOS classifies the intent (open
  an app, add a widget, change the background, change the theme).
- **`POST /api/render`** asks the model for the artifact: a complete component
  (HTML + CSS + its own JavaScript + its own frame and close button), or a
  background (a CSS value), or a theme (a token set). the model follows the UI
  contract in `src/lib/ui-contract.ts`.
- the component runs in a sandboxed iframe (`allow-scripts` only, an opaque
  origin). the host injects a trusted bridge, `window.caleidos`, the component
  calls to talk to the OS:
  - `caleidos.close()` — close itself (it owns its own close control)
  - `caleidos.resize(w, h)` — size the surface to itself (no generic window box)
  - `caleidos.saveState(obj)` — persist its state, restored on next launch
  - `caleidos.requestChange(text)` — ask to be regenerated with a change
  - `caleidos.fetchData(spec)` — request external data through the host (the
    sandbox has no network of its own); `{kind:"time",tz}` or `{kind:"http",url}`
    against real no-key public APIs (e.g. Open-Meteo for weather).
- **`POST /api/fetch`** is the host-mediated data proxy (blocks internal hosts).
- **`/api/state`** persists everything to `./os-state` (apps, widgets, the
  desktop background/theme, settings); the desktop restores it all on boot.

no Anthropic API key is required by default: the **subscription** provider uses
your `claude auth login` (see below). a provider dropdown in **settings** also
offers Claude via an API key (fast Haiku) and a local model via hydra-llm.

## prerequisites

- docker & docker compose
- a Claude subscription (for the default `claude auth login` provider), OR an
  `ANTHROPIC_API_KEY` (api-key provider), OR a local hydra-llm server (local
  provider)

## quick start

1. build and start:
```bash
docker compose up --build
```

2. log in to Claude **inside the container** (one time; the login persists in the
   `caleidos-home` volume). the one-line `exec ... claude auth login` form does
   not attach a usable TTY for the interactive OAuth flow, so open a shell first
   and run the login from inside it. in a second terminal, from this directory:
```bash
docker compose exec -it caleidos bash
# then, at the container's shell prompt:
claude auth login
```
   it defaults to Claude subscription auth (no api-key billing). follow the
   printed url, authorize, paste the code back. confirm with:
```bash
claude auth status        # inside the container shell
```
   expecting `"loggedIn": true`. then `exit`.

3. open http://localhost:3000 and type something into the command bar, e.g.
   "calculator", "a clock widget", or "set the background to a forest at dusk".

to re-authenticate later: re-run the login step (`exec -it caleidos bash`, then
`claude auth login`). to wipe the login, run `claude auth logout` inside the
container shell (or remove the volume with `docker compose down -v`).

### picking a model / provider

open **settings** (top-right) and choose a provider:
- **Claude (subscription)** — your `claude auth login`, no API key. default.
  uses whatever model the subscription path is set to inside the container
  (set it interactively in the container; Opus produces the best components,
  Haiku is faster but lower quality for self-contained components).
- **Claude (API key)** — the plain Messages API with `ANTHROPIC_API_KEY`
  (set it in a `.env` next to `docker-compose.yml`). the fast Haiku path.
- **Local (hydra-llm)** — a local model over hydra-llm's OpenAI-compatible
  `/v1`, keyless. reached via `host.docker.internal` (configure `HYDRA_BASE_URL`
  / `HYDRA_MODEL`); start a model on the host first.

## persistence

`./os-state` (bind-mounted from your checkout) is the OS's memory:
- `os-state/surfaces/<id>.json` — each app/widget: its identity, last generated
  HTML, and saved state. apps appear in the dock; widgets re-open on the desktop.
- `os-state/desktop.json` — background + theme.
- `os-state/settings.json` — active provider.

it is gitignored by default; only `docker compose down -v` discards the login
volume. `/home/caleidos` (named volume) holds the `claude auth login` creds.

## the component contract (summary)

every app/widget the model creates is one self-contained HTML document that:
- owns its entire look, including its own frame, title, and close button (there
  is NO OS window chrome around it);
- fills its surface edge to edge with no scrollbars, and calls
  `caleidos.resize(w, h)` to size itself;
- writes its own JavaScript to handle all interaction locally and instantly;
- uses the `window.caleidos` bridge for close / resize / saveState /
  requestChange / fetchData.

full contract: `src/lib/ui-contract.ts`.

## safety

the component runs in a sandboxed iframe with `allow-scripts` only (no
`allow-same-origin`): it is an opaque origin and cannot reach the parent DOM,
cookies, or storage. the only channel is `postMessage`. it has no network of its
own; `caleidos.fetchData` goes through the host proxy, which blocks internal
hosts. the subscription provider runs the model with file/shell tools disabled
(pure generation). run it on a machine you are comfortable letting a model
generate and run sandboxed client code on.

## status

working: live component creation (apps + widgets) with their own chrome,
instant local interaction (no model call per click), persistence and restore,
background + theme generation, the provider dropdown, host-mediated data fetch.
the model is invoked only on create / change / fetch.
