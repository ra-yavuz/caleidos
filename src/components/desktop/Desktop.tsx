"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComponentSurface } from "./ComponentSurface";
import { TerminalOverlay } from "./TerminalOverlay";
import { Dock } from "./Dock";
import { Settings } from "./Settings";
import { PromptBar } from "@/components/chat/PromptBar";
import { useGeneration } from "@/hooks/useGeneration";
import type {
  Surface,
  DesktopConfig,
  OsSettings,
  ProviderId,
  SurfaceKind,
} from "@/types/os";

type BootSnapshot = {
  surfaces: Surface[];
  desktop: DesktopConfig;
  settings: OsSettings;
};

// An open surface. Everything is a model-created component; apps and widgets
// differ only in default size and that widgets are desktop-resident. `html` is
// null while Desktop is still generating it (shown in the terminal overlay).
type OpenSurface = {
  id: string;
  kind: SurfaceKind;
  name: string;
  description: string;
  html: string | null;
  state: string | null;
  pos: { x: number; y: number };
  zIndex: number;
};

let zCounter = 10;

export function Desktop() {
  const { gen, generate } = useGeneration();
  const [open, setOpen] = useState<OpenSurface[]>([]);
  const [stored, setStored] = useState<Surface[]>([]);
  const [desktop, setDesktop] = useState<DesktopConfig>({
    background: null,
    theme: null,
    updatedAt: "",
  });
  const [provider, setProvider] = useState<ProviderId>("subscription");
  const providerRef = useRef<ProviderId>("subscription");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const cascade = useRef(0);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  // Boot: load persisted OS. Widgets auto-open with their stored HTML (instant,
  // no model call). Apps go to the dock.
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((snap: BootSnapshot) => {
        setDesktop(snap.desktop);
        if (snap.settings?.provider) {
          setProvider(snap.settings.provider);
          providerRef.current = snap.settings.provider;
        }
        const surfaces = snap.surfaces || [];
        setStored(surfaces);
        const widgets = surfaces.filter((s) => s.kind === "widget");
        setOpen(
          widgets.map((w, i) => ({
            id: w.id,
            kind: "widget" as const,
            name: w.name,
            description: w.description,
            html: w.html,
            state: w.state,
            pos: w.pos ?? { x: 40 + i * 30, y: 60 + i * 30 },
            zIndex: ++zCounter,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  const persistSurface = useCallback(
    (s: { id: string; kind: SurfaceKind; name: string; description: string; state: string | null; html: string | null; pos?: { x: number; y: number } }) => {
      fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "surface", surface: s }),
      }).catch(() => {});
    },
    [],
  );

  const focus = useCallback((id: string) => {
    setOpen((prev) => prev.map((s) => (s.id === id ? { ...s, zIndex: ++zCounter } : s)));
  }, []);

  const close = useCallback((id: string) => {
    setOpen((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Component saved its state (instant, local). Persist alongside current html.
  const save = useCallback(
    (id: string, state: string | null) => {
      setOpen((prev) => {
        const s = prev.find((o) => o.id === id);
        if (s) persistSurface({ ...s, state });
        return prev.map((o) => (o.id === id ? { ...o, state } : o));
      });
    },
    [persistSurface],
  );

  // Host-mediated fetch for a component's caleidos.fetchData.
  const fetchData = useCallback(async (spec: unknown): Promise<unknown> => {
    const r = await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    });
    return r.json();
  }, []);

  // Generate (create or change) a component's HTML via the terminal overlay,
  // then write it onto the surface. The only place the model is called for a
  // component.
  const generateComponent = useCallback(
    async (s: OpenSurface, change?: string) => {
      try {
        const html = await generate(
          `${change ? "updating" : "creating"} ${s.name}...`,
          {
            target: "component",
            surfaceKind: s.kind,
            appName: s.name,
            appDescription: s.description,
            currentState: s.state,
            action: change ? "change" : "__init__",
            request: change,
            provider: providerRef.current,
          },
        );
        setOpen((prev) =>
          prev.map((o) => (o.id === s.id ? { ...o, html } : o)),
        );
        persistSurface({ ...s, html });
        setStored((prev) =>
          prev.some((p) => p.id === s.id)
            ? prev.map((p) => (p.id === s.id ? { ...p, html } : p))
            : s.kind === "app"
              ? [...prev, { kind: s.kind, id: s.id, name: s.name, description: s.description, state: s.state, html, updatedAt: "" }]
              : prev,
        );
      } catch (e) {
        // surface the real error to the user
        alert(`could not ${change ? "change" : "create"} ${s.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [generate, persistSurface],
  );

  const change = useCallback(
    (id: string, request: string) => {
      setOpen((prev) => {
        const s = prev.find((o) => o.id === id);
        if (s) generateComponent(s, request);
        return prev;
      });
    },
    [generateComponent],
  );

  const openSurface = useCallback(
    (name: string, kind: SurfaceKind, description: string, existing?: Surface) => {
      const id = existing?.id ?? uniqueId(slugify(name), open);
      if (open.some((s) => s.id === id)) {
        focus(id);
        return;
      }
      const n = cascade.current++;
      const surface: OpenSurface = {
        id,
        kind,
        name,
        description,
        html: existing?.html ?? null,
        state: existing?.state ?? null,
        pos:
          kind === "widget"
            ? existing?.pos ?? { x: 40 + n * 30, y: 60 + n * 30 }
            : { x: 120 + n * 36, y: 90 + n * 36 },
        zIndex: ++zCounter,
      };
      setOpen((prev) => [...prev, surface]);
      if (!surface.html) {
        // needs creation: stream it in the terminal overlay
        generateComponent(surface);
      }
    },
    [open, focus, generateComponent],
  );

  const generateDesktop = useCallback(
    async (target: "background" | "theme", request: string) => {
      try {
        const out = await generate(
          target === "background" ? "painting the desktop..." : "theming the desktop...",
          { target, request, provider: providerRef.current },
        );
        if (target === "background") {
          const bg = out.trim();
          // The model returns either a CSS value or a full HTML document (an
          // animated "living wallpaper"). Detect by the leading "<".
          const isHtml = /^\s*<(?:!doctype|html|body|div|canvas|svg|style)/i.test(bg);
          const desktopPatch = isHtml
            ? { backgroundHtml: bg }
            : { background: bg, backgroundHtml: null };
          setDesktop((d) => ({ ...d, ...desktopPatch }));
          fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "desktop", desktop: desktopPatch }),
          }).catch(() => {});
        } else {
          const theme = JSON.parse(out.trim());
          setDesktop((d) => ({ ...d, theme }));
          fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "desktop", desktop: { theme } }),
          }).catch(() => {});
        }
      } catch (e) {
        alert(`could not set ${target}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [generate],
  );

  const handlePrompt = useCallback(
    (text: string) => {
      const t = text.trim();
      const lower = t.toLowerCase();
      // Intent keywords matched ANYWHERE in the request (not just the start), so
      // natural phrasing like "please make the wallpaper an animated night sky"
      // routes correctly. Background/theme take precedence over the widget/app
      // default.
      const mentionsBackground = /\b(background|wallpaper|desktop\s+background)\b/.test(lower);
      const mentionsTheme = /\b(theme|color\s*scheme|colour\s*scheme|accent\s+colou?r)\b/.test(lower);
      if (mentionsBackground) {
        generateDesktop("background", t);
      } else if (mentionsTheme) {
        generateDesktop("theme", t);
      } else if (/\bwidget\b/.test(lower)) {
        openSurface(shortName(t, "widget"), "widget", t);
      } else {
        openSurface(shortName(t, "app"), "app", t);
      }
    },
    [generateDesktop, openSurface],
  );

  const saveProvider = useCallback((p: ProviderId) => {
    setProvider(p);
    providerRef.current = p;
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settings", settings: { provider: p } }),
    }).catch(() => {});
  }, []);

  const forget = useCallback((id: string) => {
    fetch(`/api/state?surface=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setStored((prev) => prev.filter((s) => s.id !== id));
    setOpen((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const themeStyle = themeToVars(desktop.theme);
  const bg =
    desktop.background ||
    "linear-gradient(135deg, rgb(30 41 59) 0%, rgb(49 46 129) 50%, rgb(15 23 42) 100%)";
  const storedApps = stored.filter((s) => s.kind === "app");

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: bg, ...themeStyle }}>
      {/* animated "living wallpaper": full-screen, non-interactive, behind all */}
      {desktop.backgroundHtml && (
        <iframe
          aria-hidden
          tabIndex={-1}
          sandbox="allow-scripts"
          srcDoc={desktop.backgroundHtml}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full border-0"
          title="wallpaper"
        />
      )}
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[9800] flex h-7 items-center justify-between px-4 text-xs font-medium"
        style={{ color: "var(--menubar-text, rgba(255,255,255,0.85))" }}
      >
        <span>caleiDOS</span>
        <div className="pointer-events-auto flex items-center gap-3">
          <Clock />
          <button onClick={() => setSettingsOpen(true)} className="opacity-80 hover:opacity-100">
            settings
          </button>
        </div>
      </div>

      {open.map((s) => (
        <ComponentSurface
          key={s.id}
          surfaceId={s.id}
          kind={s.kind}
          name={s.name}
          html={s.html}
          savedState={s.state}
          pos={s.pos}
          zIndex={s.zIndex}
          onFocus={focus}
          onClose={close}
          onSave={save}
          onChange={change}
          onFetch={fetchData}
        />
      ))}

      {/* the desktop-as-terminal during any generation */}
      <TerminalOverlay active={gen.active} label={gen.label} text={gen.text} />

      {!booting && !gen.active && open.filter((s) => s.html).length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-center text-sm text-white/50">
            an OS that imagines itself.
            <br />
            name an app, add a widget, or change the background.
          </p>
        </div>
      )}

      <Dock
        apps={storedApps}
        openIds={new Set(open.map((s) => s.id))}
        onOpen={(app) => openSurface(app.name, "app", app.description, app)}
      />

      <PromptBar onSubmit={handlePrompt} />

      {settingsOpen && (
        <Settings
          provider={provider}
          onProvider={saveProvider}
          storedApps={storedApps}
          widgets={stored.filter((s) => s.kind === "widget")}
          onForget={(id) => forget(id)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "app"
  );
}

// Short title from a free-text request: strip polite filler and leading verbs,
// cut at a clause boundary, cap at a few words. Full text is still the description.
function shortName(text: string, kind: "app" | "widget"): string {
  let t = text.trim();
  t = t.split(/\b(?:with|that|which|so that|and i|, |\. )\b/i)[0];
  t = t
    .replace(
      /^(please\s+)?(can you\s+|could you\s+|i(?:'| a)?d? ?(?:like|want|need)(?: a| an| to)?\s+|make me\s+|build me\s+|give me\s+|add\s+|new\s+|open\s+|create\s+|a\s+|an\s+|the\s+)+/i,
      "",
    )
    .replace(/\bwidget\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/[^\w\s-]/g, "")
    .trim();
  const words = t.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.join(" ").trim() || (kind === "widget" ? "widget" : "app");
}

function uniqueId(base: string, open: OpenSurface[]): string {
  if (!open.some((s) => s.id === base)) return base;
  let i = 2;
  while (open.some((s) => s.id === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function themeToVars(theme: Record<string, string> | null): React.CSSProperties {
  if (!theme) return {};
  const v: Record<string, string> = {};
  if (theme.accent) v["--accent"] = theme.accent;
  if (theme.surface) v["--surface"] = theme.surface;
  if (theme.surfaceText) v["--surface-text"] = theme.surfaceText;
  if (theme.menubar) v["--menubar"] = theme.menubar;
  if (theme.menubarText) v["--menubar-text"] = theme.menubarText;
  return v as React.CSSProperties;
}

function Clock() {
  const [now, setNow] = useState<string>("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const tick = () =>
      mounted.current &&
      setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 20000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);
  return <span>{now}</span>;
}
