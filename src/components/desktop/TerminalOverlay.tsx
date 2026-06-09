"use client";

import { useEffect, useRef } from "react";

// While the model is creating or changing something, the WHOLE desktop becomes a
// terminal: the model's streaming output is shown as centered monospace text on
// the background. No window, no spinner card. When generation finishes, this
// clears and the finished component appears. The OS is the terminal during
// creation, then resolves into the thing it made.
export function TerminalOverlay({
  active,
  label,
  text,
}: {
  active: boolean;
  label: string;
  text: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [text]);

  if (!active) return null;

  // Show a live, readable tail of the stream (it is HTML being generated, so we
  // show it raw, monospace, like watching a build). Cap to the last chunk so a
  // long document does not overwhelm the screen.
  const tail = text.length > 1400 ? text.slice(-1400) : text;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9700] flex items-center justify-center px-10">
      <div className="max-h-[70vh] w-[min(900px,90vw)] overflow-hidden text-center">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm text-white/80">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
          <span className="font-mono">{label}</span>
        </div>
        <pre className="whitespace-pre-wrap break-words text-left font-mono text-[11px] leading-relaxed text-white/45">
          {tail}
          <span className="inline-block h-3 w-1.5 animate-pulse bg-white/70 align-middle" />
          <span ref={endRef} />
        </pre>
      </div>
    </div>
  );
}
