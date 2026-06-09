"use client";

import { useEffect, useRef } from "react";
import { Check, FileText, Terminal, AlertTriangle } from "lucide-react";
import type { BuildEvent } from "@/types/build-events";

export function BuildLog({ events }: { events: BuildEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-white/15 bg-black/50 p-3 text-xs text-neutral-200 backdrop-blur">
      <div className="flex flex-col gap-1.5">
        {events.map((e, i) => (
          <LogLine key={i} event={e} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function LogLine({ event }: { event: BuildEvent }) {
  switch (event.type) {
    case "status":
      return <p className="text-neutral-400">{event.text}</p>;
    case "text":
      return <p className="whitespace-pre-wrap text-neutral-100">{event.text}</p>;
    case "tool_use":
      return (
        <p className="flex items-center gap-1.5 font-mono text-neutral-400">
          <Terminal className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {event.name}
            {event.summary ? `: ${event.summary}` : ""}
          </span>
        </p>
      );
    case "file_write":
      return (
        <p className="flex items-center gap-1.5 text-emerald-300">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">wrote {shorten(event.path)}</span>
        </p>
      );
    case "done":
      return (
        <p className="flex items-center gap-1.5 text-emerald-400">
          <Check className="h-3 w-3 shrink-0" />
          built{event.durationMs ? ` in ${Math.round(event.durationMs)}ms` : ""}
        </p>
      );
    case "error":
      return (
        <p className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {event.message}
        </p>
      );
  }
}

function shorten(p: string): string {
  const idx = p.indexOf("/apps/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}
