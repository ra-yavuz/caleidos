"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";

// The OS command bar. The user types what they want; Desktop classifies the
// intent (open an app, add a widget, change background/theme) and acts. No
// streaming UI here; each surface shows its own spinner while generating.
export function PromptBar({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const t = value.trim();
    if (!t) return;
    setValue("");
    onSubmit(t);
  }

  return (
    <div className="pointer-events-auto fixed bottom-24 left-1/2 z-[9000] w-[min(680px,92vw)] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 pl-4 shadow-2xl backdrop-blur-xl">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="open an app, add a widget, or change the background..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          aria-label="go"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-neutral-900 transition disabled:opacity-40"
          style={{ background: "var(--accent, #ffffff)" }}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
