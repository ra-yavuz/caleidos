"use client";

import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { BuildLog } from "./BuildLog";
import type { BuildEvent } from "@/types/build-events";

export function PromptBar({
  onBuildStart,
  onBuildEnd,
}: {
  onBuildStart: () => void;
  onBuildEnd: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [events, setEvents] = useState<BuildEvent[]>([]);

  async function submit() {
    const text = prompt.trim();
    if (!text || building) return;

    setPrompt("");
    setEvents([]);
    setBuilding(true);
    onBuildStart();

    try {
      const resp = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });

      if (!resp.ok || !resp.body) {
        const msg = await resp.text().catch(() => "request failed");
        setEvents((p) => [...p, { type: "error", message: msg }]);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            setEvents((p) => [...p, JSON.parse(line) as BuildEvent]);
          } catch {
            // ignore a partial/garbled line
          }
        }
      }
    } catch (err) {
      setEvents((p) => [
        ...p,
        { type: "error", message: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setBuilding(false);
      onBuildEnd();
    }
  }

  return (
    <div className="pointer-events-auto fixed bottom-24 left-1/2 z-[9000] flex w-[min(680px,92vw)] -translate-x-1/2 flex-col gap-2">
      <BuildLog events={events} />
      <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 pl-4 shadow-2xl backdrop-blur-xl">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="tell caleiDOS what to build..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={building || !prompt.trim()}
          aria-label="build"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-neutral-900 transition disabled:opacity-40"
        >
          {building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
