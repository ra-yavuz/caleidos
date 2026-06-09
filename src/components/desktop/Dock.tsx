"use client";

import { LayoutGrid } from "lucide-react";
import type { Surface } from "@/types/os";

// Dock of stored apps. Clicking one (re)opens its window, restoring its state
// and showing its stored HTML instantly. Driven by persisted apps, not a live
// disk poll.
export function Dock({
  apps,
  openIds,
  onOpen,
}: {
  apps: Surface[];
  openIds: Set<string>;
  onOpen: (app: Surface) => void;
}) {
  if (apps.length === 0) return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[9500] -translate-x-1/2">
      <div className="flex items-end gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 shadow-2xl backdrop-blur-xl">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onOpen(app)}
            title={app.description || app.name}
            className="group relative flex flex-col items-center"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md transition-transform group-hover:-translate-y-1"
              style={{
                background:
                  "var(--accent, linear-gradient(to bottom right, #818cf8, #d946ef))",
              }}
            >
              <LayoutGrid className="h-5 w-5" />
            </div>
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                openIds.has(app.id) ? "bg-white" : "bg-transparent"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
