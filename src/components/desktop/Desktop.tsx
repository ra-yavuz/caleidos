"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAppRegistry } from "@/hooks/useAppRegistry";
import { useWindowManager } from "@/hooks/useWindowManager";
import { Window } from "./Window";
import { Dock } from "./Dock";
import { PromptBar } from "@/components/chat/PromptBar";

// AppRenderer pulls in framer-motion + a runtime import; load it client-only.
const AppRenderer = dynamic(() => import("@/app/render/[slug]/AppRenderer"), {
  ssr: false,
});

export function Desktop() {
  const [buildActive, setBuildActive] = useState(false);
  const { apps } = useAppRegistry(buildActive);
  const { windows, openWindow, closeWindow, focusWindow } =
    useWindowManager();

  // Auto-open a window the first time a new app appears on disk.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const app of apps) {
      if (!seen.current.has(app.slug)) {
        seen.current.add(app.slug);
        openWindow(app.slug, app.title);
      }
    }
  }, [apps, openWindow]);

  const openSlugs = new Set(windows.map((w) => w.slug));

  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900">
      {/* top bar */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[9800] flex h-7 items-center justify-between px-4 text-xs font-medium text-white/80">
        <span>caleiDOS</span>
        <Clock />
      </div>

      {/* window layer */}
      {windows.map((w) => (
        <Window
          key={w.id}
          entry={w}
          onClose={closeWindow}
          onFocus={focusWindow}
        >
          <AppRenderer slug={w.slug} />
        </Window>
      ))}

      {/* empty state */}
      {windows.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-center text-sm text-white/40">
            nothing built yet.
            <br />
            tell caleiDOS what to build.
          </p>
        </div>
      )}

      <Dock
        apps={apps}
        openSlugs={openSlugs}
        onOpen={(slug, title) => openWindow(slug, title)}
      />

      <PromptBar
        onBuildStart={() => setBuildActive(true)}
        onBuildEnd={() => setBuildActive(false)}
      />
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000 * 20);
    return () => clearInterval(id);
  }, []);
  return <span>{now}</span>;
}
