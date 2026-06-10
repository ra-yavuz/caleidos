"use client";

import { Icon } from "./Icon";
import type { Surface } from "@/types/os";

// Dock of installed apps, each with its own model-generated icon. Clicking a
// tile toggles: closed -> open, open -> minimize, minimized -> restore. The dot
// under a tile marks an open (non-minimized) app; a dimmer dot marks minimized.
export function Dock({
  apps,
  open,
  onToggle,
}: {
  apps: Surface[];
  open: { id: string; minimized: boolean }[];
  onToggle: (app: Surface) => void;
}) {
  if (apps.length === 0) return null;
  const openMap = new Map(open.map((o) => [o.id, o.minimized]));

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[9500] -translate-x-1/2">
      <div className="flex items-end gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 shadow-2xl backdrop-blur-xl">
        {apps.map((app) => {
          const isOpen = openMap.has(app.id);
          const isMin = openMap.get(app.id) === true;
          return (
            <button
              key={app.id}
              onClick={() => onToggle(app)}
              title={app.description || app.name}
              className="group relative flex flex-col items-center"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md transition-transform group-hover:-translate-y-1"
                style={{
                  background: app.icon
                    ? "rgba(255,255,255,0.12)"
                    : "var(--accent, linear-gradient(to bottom right, #818cf8, #d946ef))",
                }}
              >
                <Icon icon={app.icon} className="h-7 w-7" />
              </div>
              <span
                className={`mt-1 h-1 w-1 rounded-full ${
                  isOpen ? (isMin ? "bg-white/40" : "bg-white") : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
