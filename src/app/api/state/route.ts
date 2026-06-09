import fs from "node:fs";
import path from "node:path";
import type { Surface, DesktopConfig, OsSettings } from "@/types/os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Persisted OS lives in ./os-state on the host (bind-mounted). Layout:
//   os-state/surfaces/<id>.json   one app or widget each
//   os-state/desktop.json         background + theme
//   os-state/settings.json        active provider + posture
// This is the OS's memory: on boot the shell reads it all and restores.
const ROOT = path.join(process.cwd(), "os-state");
const SURFACES = path.join(ROOT, "surfaces");
const DESKTOP_FILE = path.join(ROOT, "desktop.json");
const SETTINGS_FILE = path.join(ROOT, "settings.json");

function safeId(id: string): string | null {
  return /^[a-z0-9-]{1,80}$/.test(id) ? id : null;
}

function ensureDirs() {
  try {
    fs.mkdirSync(SURFACES, { recursive: true });
  } catch {
    // ignore
  }
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const DEFAULT_DESKTOP: DesktopConfig = {
  background: null,
  theme: null,
  updatedAt: "",
};
const DEFAULT_SETTINGS: OsSettings = {
  provider: "subscription",
  posture: "frugal",
  updatedAt: "",
};

// GET /api/state                 -> { surfaces, desktop, settings } (full boot snapshot)
// GET /api/state?surface=<id>    -> one surface
export async function GET(req: Request) {
  ensureDirs();
  const url = new URL(req.url);
  const surfaceId = url.searchParams.get("surface");

  if (surfaceId) {
    const sid = safeId(surfaceId);
    if (!sid) return Response.json({ error: "bad id" }, { status: 400 });
    try {
      const raw = fs.readFileSync(path.join(SURFACES, sid + ".json"), "utf8");
      return Response.json(JSON.parse(raw) as Surface);
    } catch {
      return Response.json({ error: "not found" }, { status: 404 });
    }
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(SURFACES).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const surfaces: Surface[] = [];
  for (const f of files) {
    const s = readJSON<Surface | null>(path.join(SURFACES, f), null);
    if (s) surfaces.push(s);
  }
  surfaces.sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));

  return Response.json({
    surfaces,
    desktop: readJSON<DesktopConfig>(DESKTOP_FILE, DEFAULT_DESKTOP),
    settings: readJSON<OsSettings>(SETTINGS_FILE, DEFAULT_SETTINGS),
  });
}

// POST /api/state
//   { type: "surface", surface: {...} }   upsert an app/widget
//   { type: "desktop", desktop: {...} }   set background/theme
//   { type: "settings", settings: {...} } set provider/posture
export async function POST(req: Request) {
  ensureDirs();
  let body: {
    type?: string;
    surface?: Partial<Surface>;
    desktop?: Partial<DesktopConfig>;
    settings?: Partial<OsSettings>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const now = new Date().toISOString();

  try {
    if (body.type === "surface" && body.surface) {
      const s = body.surface;
      const sid = s.id && safeId(s.id);
      if (!sid || !s.name || (s.kind !== "app" && s.kind !== "widget")) {
        return Response.json(
          { error: "surface requires id, name, kind app|widget" },
          { status: 400 },
        );
      }
      const record: Surface = {
        kind: s.kind,
        id: sid,
        name: s.name,
        description: s.description || "",
        state: typeof s.state === "string" ? s.state : null,
        html: typeof s.html === "string" ? s.html : null,
        pos: s.pos,
        size: s.size,
        updatedAt: now,
      };
      fs.writeFileSync(
        path.join(SURFACES, sid + ".json"),
        JSON.stringify(record, null, 2),
      );
      return Response.json({ ok: true });
    }

    if (body.type === "desktop" && body.desktop) {
      const prev = readJSON<DesktopConfig>(DESKTOP_FILE, DEFAULT_DESKTOP);
      const record: DesktopConfig = {
        background:
          body.desktop.background !== undefined
            ? body.desktop.background
            : prev.background,
        backgroundHtml:
          body.desktop.backgroundHtml !== undefined
            ? body.desktop.backgroundHtml
            : prev.backgroundHtml ?? null,
        theme:
          body.desktop.theme !== undefined ? body.desktop.theme : prev.theme,
        updatedAt: now,
      };
      fs.writeFileSync(DESKTOP_FILE, JSON.stringify(record, null, 2));
      return Response.json({ ok: true });
    }

    if (body.type === "settings" && body.settings) {
      const prev = readJSON<OsSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);
      const record: OsSettings = {
        provider: body.settings.provider || prev.provider,
        posture: body.settings.posture || prev.posture,
        updatedAt: now,
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(record, null, 2));
      return Response.json({ ok: true });
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "write failed" },
      { status: 500 },
    );
  }
  return Response.json({ error: "unknown POST shape" }, { status: 400 });
}

// DELETE /api/state?surface=<id>  -> forget an app/widget
export async function DELETE(req: Request) {
  ensureDirs();
  const surfaceId = new URL(req.url).searchParams.get("surface");
  const sid = surfaceId && safeId(surfaceId);
  if (!sid) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    fs.unlinkSync(path.join(SURFACES, sid + ".json"));
  } catch {
    // already gone
  }
  return Response.json({ ok: true });
}
