"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComponentSurface } from "./ComponentSurface";
import { TerminalOverlay } from "./TerminalOverlay";
import { Dock } from "./Dock";
import { Settings } from "./Settings";
import { AppMenu } from "./AppMenu";
import { AppStore } from "./AppStore";
import { Browser } from "./Browser";
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

// An open surface. `html` is null while Desktop is still generating it (shown in
// the terminal overlay). `minimized` hides it without closing (iframe stays
// mounted so live state survives).
type OpenSurface = {
  id: string;
  kind: SurfaceKind;
  name: string;
  description: string;
  html: string | null;
  state: string | null;
  icon: string | null;
  pos: { x: number; y: number };
  zIndex: number;
  minimized: boolean;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const cascade = useRef(0);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

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
        // widgets auto-open; apps go to the dock/menu
        const widgets = surfaces.filter((s) => s.kind === "widget");
        setOpen(
          widgets.map((w, i) => ({
            id: w.id,
            kind: "widget" as const,
            name: w.name,
            description: w.description,
            html: w.html,
            state: w.state,
            icon: w.icon ?? null,
            pos: w.pos ?? { x: 40 + i * 30, y: 60 + i * 30 },
            zIndex: ++zCounter,
            minimized: false,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  const persistSurface = useCallback(
    (s: {
      id: string;
      kind: SurfaceKind;
      name: string;
      description: string;
      state?: string | null;
      html?: string | null;
      icon?: string | null;
      pos?: { x: number; y: number };
    }) => {
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

  const save = useCallback(
    (id: string, state: string | null) => {
      setOpen((prev) => {
        const s = prev.find((o) => o.id === id);
        if (s) persistSurface({ id, kind: s.kind, name: s.name, description: s.description, state });
        return prev.map((o) => (o.id === id ? { ...o, state } : o));
      });
    },
    [persistSurface],
  );

  const setIcon = useCallback(
    (id: string, icon: string) => {
      setOpen((prev) => {
        const s = prev.find((o) => o.id === id);
        if (s) persistSurface({ id, kind: s.kind, name: s.name, description: s.description, icon });
        return prev.map((o) => (o.id === id ? { ...o, icon } : o));
      });
      setStored((prev) => prev.map((p) => (p.id === id ? { ...p, icon } : p)));
    },
    [persistSurface],
  );

  const fetchData = useCallback(async (spec: unknown): Promise<unknown> => {
    const r = await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    });
    return r.json();
  }, []);

  // Generate (create or change) a component's HTML via the terminal overlay.
  const generateComponent = useCallback(
    async (s: OpenSurface, change?: string) => {
      try {
        const html = await generate(`${change ? "updating" : "creating"} ${s.name}...`, {
          target: "component",
          surfaceKind: s.kind,
          appName: s.name,
          appDescription: s.description,
          currentState: s.state,
          action: change ? "change" : "__init__",
          request: change,
          provider: providerRef.current,
        });
        setOpen((prev) => prev.map((o) => (o.id === s.id ? { ...o, html } : o)));
        persistSurface({ id: s.id, kind: s.kind, name: s.name, description: s.description, html });
        setStored((prev) =>
          prev.some((p) => p.id === s.id)
            ? prev.map((p) => (p.id === s.id ? { ...p, html } : p))
            : s.kind === "app"
              ? [...prev, { kind: s.kind, id: s.id, name: s.name, description: s.description, state: s.state, html, icon: s.icon, updatedAt: "" }]
              : prev,
        );
      } catch (e) {
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

  // Open a surface (by name or from a stored/installed app). Generates on first
  // open if it has no html yet.
  const openSurface = useCallback(
    (name: string, kind: SurfaceKind, description: string, existing?: Surface) => {
      const id = existing?.id ?? uniqueId(slugify(name), open);
      let needsGen = false;
      let created: OpenSurface | null = null;
      setOpen((prev) => {
        const already = prev.find((s) => s.id === id);
        if (already) {
          // restore if minimized, else focus
          return prev.map((s) => (s.id === id ? { ...s, minimized: false, zIndex: ++zCounter } : s));
        }
        const n = cascade.current++;
        const surface: OpenSurface = {
          id,
          kind,
          name,
          description,
          html: existing?.html ?? null,
          state: existing?.state ?? null,
          icon: existing?.icon ?? null,
          pos:
            kind === "widget"
              ? existing?.pos ?? { x: 40 + n * 30, y: 60 + n * 30 }
              : { x: 120 + n * 36, y: 90 + n * 36 },
          zIndex: ++zCounter,
          minimized: false,
        };
        created = surface;
        needsGen = !surface.html;
        return [...prev, surface];
      });
      if (needsGen && created) generateComponent(created);
    },
    [open, generateComponent],
  );

  // Dock click: toggle minimize/restore for an open app; open a closed one.
  const dockToggle = useCallback(
    (app: Surface) => {
      const o = open.find((s) => s.id === app.id);
      if (!o) {
        openSurface(app.name, "app", app.description, app);
        return;
      }
      setOpen((prev) =>
        prev.map((s) =>
          s.id === app.id
            ? { ...s, minimized: !s.minimized, zIndex: s.minimized ? ++zCounter : s.zIndex }
            : s,
        ),
      );
    },
    [open, openSurface],
  );

  // Register a new app (from the App Store / caleidos.install). Lands in the
  // dock/menu instantly; component generated on first open.
  const installApp = useCallback(
    (app: { name?: string; description?: string; icon?: string }) => {
      const name = (app.name || "app").trim();
      const id = uniqueId(slugify(name), open);
      if (stored.some((s) => s.id === id)) return; // already installed
      const surface: Surface = {
        kind: "app",
        id,
        name,
        description: app.description || name,
        state: null,
        html: null,
        icon: app.icon || null,
        updatedAt: "",
      };
      setStored((prev) => [...prev, surface]);
      persistSurface({
        id,
        kind: "app",
        name,
        description: surface.description,
        icon: surface.icon,
        html: null,
        state: null,
      });
    },
    [open, stored, persistSurface],
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
          const isHtml = /^\s*<(?:!doctype|html|body|div|canvas|svg|style)/i.test(bg);
          const patch = isHtml ? { backgroundHtml: bg } : { background: bg, backgroundHtml: null };
          setDesktop((d) => ({ ...d, ...patch }));
          fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "desktop", desktop: patch }),
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
      const mentionsBackground = /\b(background|wallpaper|desktop\s+background)\b/.test(lower);
      const mentionsTheme = /\b(theme|colou?r\s*scheme|accent\s+colou?r)\b/.test(lower);
      if (mentionsBackground) generateDesktop("background", t);
      else if (mentionsTheme) generateDesktop("theme", t);
      else if (/\bwidget\b/.test(lower)) openSurface(shortName(t, "widget"), "widget", t);
      else openSurface(shortName(t, "app"), "app", t);
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
          <button onClick={() => setMenuOpen(true)} className="opacity-80 hover:opacity-100">apps</button>
          <button onClick={() => setStoreOpen(true)} className="opacity-80 hover:opacity-100">store</button>
          <button onClick={() => setBrowserOpen(true)} className="opacity-80 hover:opacity-100">browser</button>
          <Clock />
          <button onClick={() => setSettingsOpen(true)} className="opacity-80 hover:opacity-100">settings</button>
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
          minimized={s.minimized}
          onFocus={focus}
          onClose={close}
          onSave={save}
          onChange={change}
          onFetch={fetchData}
          onIcon={setIcon}
          onInstall={installApp}
        />
      ))}

      <TerminalOverlay active={gen.active} label={gen.label} text={gen.text} />

      {!booting && !gen.active && open.filter((s) => s.html && !s.minimized).length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-center text-sm text-white/50">
            an OS that imagines itself.
            <br />
            name an app, add a widget, change the background, or open the store.
          </p>
        </div>
      )}

      <Dock
        apps={storedApps}
        open={open.map((s) => ({ id: s.id, minimized: s.minimized }))}
        onToggle={dockToggle}
      />

      <PromptBar onSubmit={handlePrompt} />

      {menuOpen && (
        <AppMenu
          apps={storedApps}
          onOpen={(app) => {
            openSurface(app.name, "app", app.description, app);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {storeOpen && (
        <AppStore
          provider={provider}
          installedIds={new Set(stored.map((s) => s.id))}
          onInstall={installApp}
          onClose={() => setStoreOpen(false)}
        />
      )}

      {browserOpen && <Browser provider={provider} onClose={() => setBrowserOpen(false)} />}

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

function uniqueId(base: string, open: { id: string }[]): string {
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
