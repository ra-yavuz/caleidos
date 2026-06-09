"use client";

import { useCallback, useState } from "react";
import type { WindowEntry } from "@/types/window";

const DEFAULT_SIZE = { w: 640, h: 460 };
const CASCADE = 32;

let counter = 0;
const nextId = () => `win-${++counter}`;

export function useWindowManager() {
  const [windows, setWindows] = useState<WindowEntry[]>([]);

  const openWindow = useCallback((slug: string, title: string) => {
    setWindows((prev) => {
      // Already open: focus it instead of duplicating.
      const existing = prev.find((w) => w.slug === slug);
      if (existing) {
        return prev.map((w) =>
          w.id === existing.id ? { ...w, zIndex: ++counter } : w,
        );
      }
      const n = prev.length;
      const entry: WindowEntry = {
        id: nextId(),
        slug,
        title,
        pos: { x: 80 + n * CASCADE, y: 70 + n * CASCADE },
        size: { ...DEFAULT_SIZE },
        zIndex: ++counter,
      };
      return [...prev, entry];
    });
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: ++counter } : w)),
    );
  }, []);

  const isOpen = useCallback(
    (slug: string) => windows.some((w) => w.slug === slug),
    [windows],
  );

  return { windows, openWindow, closeWindow, focusWindow, isOpen };
}
