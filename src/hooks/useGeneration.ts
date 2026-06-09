"use client";

import { useCallback, useState } from "react";
import type { ProviderId } from "@/types/os";

type GenState = { active: boolean; label: string; text: string };

export type RenderArgs = {
  target: "component" | "background" | "theme";
  surfaceKind?: "app" | "widget";
  appName?: string;
  appDescription?: string;
  currentState?: string | null;
  action?: "__init__" | "change";
  request?: string;
  provider: ProviderId;
};

// Owns the desktop-wide "terminal" generation state. Any create/change/appearance
// call streams here, updating centered live text on the background. Resolves with
// the finished output (HTML / CSS / JSON string). Throws on a CALEIDOS_ERROR or a
// transport failure, with a real message, so callers can surface it.
export function useGeneration() {
  const [gen, setGen] = useState<GenState>({ active: false, label: "", text: "" });

  const generate = useCallback(async (label: string, args: RenderArgs): Promise<string> => {
    setGen({ active: true, label, text: "" });
    try {
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`render failed (HTTP ${resp.status})`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
        setGen((g) => (g.active ? { ...g, text: out } : g));
      }
      const err = out.match(/<!--CALEIDOS_ERROR:([\s\S]*?)-->/);
      if (err) throw new Error(err[1].trim());
      return out;
    } finally {
      setGen({ active: false, label: "", text: "" });
    }
  }, []);

  return { gen, generate };
}
