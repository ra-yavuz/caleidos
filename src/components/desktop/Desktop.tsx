"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComponentSurface } from "./ComponentSurface";
import { Dock } from "./Dock";
import { Settings } from "./Settings";
import { PromptBar } from "@/components/chat/PromptBar";
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

// An open surface on the desktop. Everything is a model-created component; apps
// and widgets differ only in default size and that widgets are desktop-resident.
type OpenSurface = {
  id: string;
  kind: SurfaceKind;
  name: string;
  description: string;
  initialState: string | null;
  initialHtml: string | null;
  pos: { x: number; y: number };
  zIndex: number;
};

let zCounter = 10;

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "app"
  );
}

// Derive a short, human title from a free-text request. Strips polite filler and
// leading verbs, drops anything after a clause break, caps at a few words. The
// full text is still passed to the model as the description.
function shortName(text: string, kind: "app" | "widget"): string {
  let t = text.trim();
  // cut at the first clause boundary (so "weather and time with a nice design
  // please" -> "weather and time")
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
  const name = words.join(" ").trim();
  return name || (kind === "widget" ? "widget" : "app");
}

export function Desktop() {
  const [open, setOpen] = useState<OpenSurface[]>([]);
  const [stored, setStored] = useState<Surface[]>([]); // persisted surfaces (for dock + restore)
  const [desktop, setDesktop] = useState<DesktopConfig>({
    background: null,
    theme: null,
    updatedAt: "",
  });
  const [provider, setProvider] = useState<ProviderId>("subscription");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const cascade = useRef(0);

  // Boot: load persisted OS. Widgets auto-open (desktop-resident); apps go to
  // the dock and open on click.
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((snap: BootSnapshot) => {
        setDesktop(snap.desktop);
        if (snap.settings?.provider) setProvider(snap.settings.provider);
        const surfaces = snap.surfaces || [];
        setStored(surfaces);
        // auto-open widgets
        const widgets = surfaces.filter((s) => s.kind === "widget");
        setOpen(
          widgets.map((w, i) => ({
            id: w.id,
            kind: "widget" as const,
            name: w.name,
            description: w.description,
            initialState: w.state,
            initialHtml: w.html,
            pos: w.pos ?? { x: 40 + i * 30, y: 60 + i * 30 },
            zIndex: ++zCounter,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  const focus = useCallback((id: string) => {
    setOpen((prev) => prev.map((s) => (s.id === id ? { ...s, zIndex: ++zCounter } : s)));
  }, []);

  const close = useCallback((id: string) => {
    setOpen((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const persist = useCallback(
    (id: string, state: string | null, html: string) => {
      setOpen((prev) => {
        const s = prev.find((o) => o.id === id);
        if (s) {
          fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "surface",
              surface: {
                kind: s.kind,
                id,
                name: s.name,
                description: s.description,
                state,
                html: html || s.initialHtml,
                pos: s.pos,
              },
            }),
          }).catch(() => {});
        }
        return prev;
      });
      // refresh the stored list so the dock reflects new apps
      setStored((prev) =>
        prev.some((p) => p.id === id)
          ? prev.map((p) => (p.id === id ? { ...p, state, html: html || p.html } : p))
          : prev,
      );
    },
    [],
  );

  const openSurface = useCallback(
    (name: string, kind: SurfaceKind, description: string, existing?: Surface) => {
      const id = existing?.id ?? uniqueId(slugify(name), open);
      setOpen((prev) => {
        if (prev.some((s) => s.id === id)) {
          return prev.map((s) => (s.id === id ? { ...s, zIndex: ++zCounter } : s));
        }
        const n = cascade.current++;
        return [
          ...prev,
          {
            id,
            kind,
            name,
            description,
            initialState: existing?.state ?? null,
            initialHtml: existing?.html ?? null,
            pos:
              kind === "widget"
                ? existing?.pos ?? { x: 40 + n * 30, y: 60 + n * 30 }
                : { x: 120 + n * 36, y: 90 + n * 36 },
            zIndex: ++zCounter,
          },
        ];
      });
      // ensure it shows in the stored list (dock) for apps
      if (kind === "app" && !stored.some((s) => s.id === id)) {
        setStored((prev) => [
          ...prev,
          { kind, id, name, description, state: null, html: null, updatedAt: "" },
        ]);
      }
    },
    [open, stored],
  );

  const generateDesktop = useCallback(
    async (target: "background" | "theme", request: string) => {
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, request, provider }),
      });
      if (!resp.ok || !resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
      }
      if (out.includes("CALEIDOS_ERROR")) return;
      if (target === "background") {
        const bg = out.trim();
        setDesktop((d) => ({ ...d, background: bg }));
        fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "desktop", desktop: { background: bg } }),
        }).catch(() => {});
      } else {
        try {
          const theme = JSON.parse(out.trim());
          setDesktop((d) => ({ ...d, theme }));
          fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "desktop", desktop: { theme } }),
          }).catch(() => {});
        } catch {
          // not JSON; ignore
        }
      }
    },
    [provider],
  );

  // Classify the typed request into an intent. The full text is the description
  // (carried to the model); a short label is derived for the title/dock/id.
  const handlePrompt = useCallback(
    (text: string) => {
      const t = text.trim();
      const lower = t.toLowerCase();
      if (/^(set |change )?(the )?(background|wallpaper)\b/.test(lower)) {
        generateDesktop("background", t);
      } else if (/^(set |change )?(the )?theme\b/.test(lower) || lower.startsWith("theme:")) {
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
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settings", settings: { provider: p } }),
    }).catch(() => {});
  }, []);

  const forget = useCallback((id: string, _kind: "app" | "widget") => {
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
      {/* menubar */}
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

      {/* all open surfaces (apps + widgets), chromeless */}
      {open.map((s) => (
        <ComponentSurface
          key={s.id}
          surfaceId={s.id}
          kind={s.kind}
          name={s.name}
          description={s.description}
          provider={provider}
          initialState={s.initialState}
          initialHtml={s.initialHtml}
          pos={s.pos}
          zIndex={s.zIndex}
          onClose={close}
          onFocus={focus}
          onPersist={persist}
        />
      ))}

      {!booting && open.length === 0 && (
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
          onForget={forget}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
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
