// The persisted OS data model. Everything the model creates lives here and is
// stored under ./os-state on the host, so the OS remembers itself across
// restarts. Four surface kinds plus global config.

export type ProviderId = "subscription" | "apikey" | "hydra";

// A surface the model generates as a self-contained HTML component. Apps open
// in windows; widgets sit on the desktop layer. Same component contract.
export type SurfaceKind = "app" | "widget";

export type Surface = {
  kind: SurfaceKind;
  id: string; // slug; also the os-state filename
  name: string;
  description: string; // identity carried to the model every turn
  state: string | null; // the component's JSON state blob (its memory)
  html: string | null; // last generated component HTML (so reopen is instant, no regen)
  // widgets carry a desktop position; apps use window cascade
  pos?: { x: number; y: number };
  size?: { w: number; h: number };
  updatedAt: string;
};

// Desktop appearance: a generated background plus a theme token set the shell
// reads. Both model-creatable, neither requires editing framework code.
export type DesktopConfig = {
  // background is a CSS value (gradient, color) applied to the desktop root.
  background: string | null;
  // OR an animated "living wallpaper": a full HTML document rendered in a
  // full-screen, non-interactive iframe behind everything. When set, it takes
  // visual precedence over `background`.
  backgroundHtml?: string | null;
  // theme tokens the shell maps to CSS variables (accent, surface, text, etc.)
  theme: Record<string, string> | null;
  updatedAt: string;
};

// Global settings the Settings panel manages (mostly fixed UI, model not needed).
export type OsSettings = {
  provider: ProviderId; // active model provider
  // frugal posture is the default and only mode for now; kept for future
  posture: "frugal" | "responsive";
  updatedAt: string;
};

// One logged interaction for model awareness. The framework records every click
// and keystroke; the recent tail is passed to the model only when it is invoked
// (explicit request or unhandled action), never as a wake-on-every-event call.
export type InteractionEvent = {
  t: number; // ms epoch (stamped client-side)
  surfaceId: string;
  kind: "click" | "input" | "open" | "action";
  action?: string; // data-action verb, if any
  detail?: string; // typed text snippet or target label
};
