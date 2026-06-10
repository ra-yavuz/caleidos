"use client";

import { X } from "lucide-react";
import { Icon } from "./Icon";
import type { Surface } from "@/types/os";

// Framework launcher: a grid of installed apps with their icons. Click opens.
export function AppMenu({
  apps,
  onOpen,
  onClose,
}: {
  apps: Surface[];
  onOpen: (app: Surface) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/30 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(640px,92vw)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-800">apps</h2>
          <button onClick={onClose} aria-label="close" className="text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4">
          {apps.length === 0 ? (
            <p className="text-sm text-neutral-400">
              no apps yet. name an app in the command bar, or open the store.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-5">
              {apps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => onOpen(app)}
                  title={app.description || app.name}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700 shadow-sm transition hover:scale-105">
                    <Icon icon={app.icon} className="h-8 w-8" />
                  </span>
                  <span className="line-clamp-1 max-w-[64px] text-center text-[11px] text-neutral-600">
                    {app.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
