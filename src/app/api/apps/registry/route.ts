import fs from "node:fs";
import path from "node:path";
import type { AppMeta } from "@/types/app-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_DIR = path.join(process.cwd(), "apps");

// Scan /apps for subdirectories that contain an index.tsx, and return their
// metadata. Reads meta.json when present, else synthesizes a minimal record.
export async function GET() {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  } catch {
    return Response.json([] as AppMeta[]);
  }

  const apps: AppMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const dir = path.join(APPS_DIR, slug);

    // An app only counts once its component file exists.
    if (!fs.existsSync(path.join(dir, "index.tsx"))) continue;

    let meta: AppMeta = {
      slug,
      title: slug,
      description: "",
      createdAt: "",
    };
    try {
      const raw = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
      const parsed = JSON.parse(raw) as Partial<AppMeta>;
      meta = {
        slug,
        title: typeof parsed.title === "string" ? parsed.title : slug,
        description:
          typeof parsed.description === "string" ? parsed.description : "",
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
      };
    } catch {
      // no/invalid meta.json - keep the synthesized default
    }
    apps.push(meta);
  }

  apps.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Response.json(apps);
}
