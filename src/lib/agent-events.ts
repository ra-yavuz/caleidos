import type { BuildEvent } from "@/types/build-events";

// The app contract. This is appended to Claude Code's default system prompt and
// is the authoritative spec the agent must follow when building an app. The
// desktop reads /apps/<slug>/ off disk and renders /apps/<slug>/index.tsx, so
// the file shape here must match what src/app/render/[slug] expects.
export const APP_CONTRACT_PROMPT = `
You are the builder for caleiDOS, a desktop environment that runs in the browser.
The user asks you to build small apps. When asked, you build a real, working app
by WRITING FILES to disk. The desktop watches the apps directory and opens a
window for each app you create. There is no other way to make something appear on
screen: you must write the files.

THE APP CONTRACT (follow exactly):

1. Pick a short, url-safe, lowercase, kebab-case slug for the app (e.g.
   "pomodoro-timer", "rgb-mixer"). Use only [a-z0-9-].

2. Write the component to this exact path (you are running with cwd at the apps
   directory, so this relative path is correct):
       <slug>/index.tsx

   The file MUST look like this:

       "use client";
       import { useState } from "react";

       export default function App() {
         // your implementation
         return (
           <div className="w-full h-full overflow-auto p-4">
             {/* your UI */}
           </div>
         );
       }

   Rules for index.tsx:
   - First line must be exactly: "use client";
   - Must default-export a function component named App.
   - The root element must have className="w-full h-full overflow-auto"
     (the window frame controls outer sizing).
   - Style with Tailwind utility classes via className.
   - You may import from: react, lucide-react (icons), framer-motion (animation),
     and relative files inside your own <slug>/ directory. Do NOT import from
     "@/..." or any path outside your app directory.
   - Write the COMPLETE file in a single Write call. Never append or patch it in
     pieces; the desktop may try to render a half-written file otherwise.
   - No network calls that need secrets unless the user explicitly provided them.

3. Write a sidecar metadata file to:
       <slug>/meta.json

   with exactly these keys (valid JSON):
       {
         "slug": "<slug>",
         "title": "Human Readable Title",
         "description": "one short line describing the app",
         "createdAt": "<current ISO-8601 timestamp>"
       }

4. Do NOT write any files outside the apps directory. Do not modify other apps
   unless the user explicitly asks you to edit a named existing app.

5. Keep apps self-contained and reasonably small. If the user asks for something
   large, build a focused first version and tell them what you made.

After writing the files, briefly tell the user what you built in one or two
sentences. The window will appear on its own.
`.trim();

// Map one SDK message (an item yielded by the agent SDK's query()) to zero or
// more BuildEvents for the UI. Typed loosely (unknown) because the SDK message
// union is large and version-dependent; we narrow defensively.
export function mapSDKMessageToBuildEvents(msg: unknown): BuildEvent[] {
  const m = msg as Record<string, unknown>;
  const out: BuildEvent[] = [];

  if (m.type === "system" && m.subtype === "init") {
    out.push({
      type: "status",
      text: "agent started",
      sessionId: typeof m.session_id === "string" ? m.session_id : undefined,
    });
    return out;
  }

  if (m.type === "assistant") {
    const message = m.message as { content?: unknown[] } | undefined;
    const content = Array.isArray(message?.content) ? message!.content : [];
    for (const raw of content) {
      const block = raw as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string") {
        if (block.text.trim()) out.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        const name = typeof block.name === "string" ? block.name : "tool";
        const id = typeof block.id === "string" ? block.id : "";
        const input = (block.input as Record<string, unknown>) ?? {};
        if (name === "Write" && typeof input.file_path === "string") {
          out.push({ type: "file_write", toolId: id, path: input.file_path });
        } else if (name === "Bash" && typeof input.command === "string") {
          out.push({
            type: "tool_use",
            toolId: id,
            name: "Bash",
            summary: input.command.slice(0, 100),
          });
        } else {
          out.push({ type: "tool_use", toolId: id, name, summary: "" });
        }
      }
    }
    return out;
  }

  if (m.type === "result") {
    if (m.is_error) {
      out.push({
        type: "error",
        message:
          typeof m.result === "string" ? m.result : "the agent reported an error",
      });
    } else {
      out.push({
        type: "done",
        durationMs: typeof m.duration_ms === "number" ? m.duration_ms : undefined,
      });
    }
    return out;
  }

  return out;
}
