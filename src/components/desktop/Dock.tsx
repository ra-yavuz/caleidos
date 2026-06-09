"use client";

import { LayoutGrid } from "lucide-react";
import type { AppMeta } from "@/types/app-registry";

// Minimal dock: one tile per built app. Phase 3 adds magnification.
export function Dock({
  apps,
  openSlugs,
  onOpen,
}: {
  apps: AppMeta[];
  openSlugs: Set<string>;
  onOpen: (slug: string, title: string) => void;
}) {
  if (apps.length === 0) return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[9500] -translate-x-1/2">
      <div className="flex items-end gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 shadow-2xl backdrop-blur-xl">
        {apps.map((app) => (
          <button
            key={app.slug}
            onClick={() => onOpen(app.slug, app.title)}
            title={app.description || app.title}
            className="group relative flex flex-col items-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-white shadow-md transition-transform group-hover:-translate-y-1">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                openSlugs.has(app.slug) ? "bg-white" : "bg-transparent"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
