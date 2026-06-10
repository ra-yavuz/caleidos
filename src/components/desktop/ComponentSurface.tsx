"use client";

import { motion, useDragControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { buildSrcdoc } from "@/lib/ui-contract";
import type { SurfaceKind } from "@/types/os";

// A chromeless, draggable surface hosting one model-created component. The
// framework imposes NO window chrome: the component owns its entire look,
// including its own frame and close button. This is a pure renderer: it does not
// call the model. Desktop generates HTML (via the terminal overlay) and passes
// it here; the component then runs its own JS locally with no per-click calls.
// Bridge messages from the component are forwarded up to Desktop.
export function ComponentSurface({
  surfaceId,
  kind,
  name,
  html,
  savedState,
  pos,
  zIndex,
  minimized,
  onFocus,
  onClose,
  onSave,
  onChange,
  onFetch,
  onIcon,
  onInstall,
}: {
  surfaceId: string;
  kind: SurfaceKind;
  name: string;
  html: string | null; // null while Desktop is still generating it
  savedState: string | null;
  pos: { x: number; y: number };
  zIndex: number;
  minimized?: boolean;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onSave: (id: string, state: string | null) => void;
  onChange: (id: string, request: string) => void;
  onFetch: (spec: unknown) => Promise<unknown>;
  onIcon: (id: string, icon: string) => void;
  onInstall: (app: { name?: string; description?: string; icon?: string }) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const controls = useDragControls();
  const [size, setSize] = useState<{ w: number; h: number }>(
    kind === "widget" ? { w: 240, h: 180 } : { w: 380, h: 460 },
  );

  // Render the component HTML whenever it changes (initial create or a change).
  useEffect(() => {
    if (html && iframeRef.current) {
      iframeRef.current.srcdoc = buildSrcdoc(html, savedState);
    }
  }, [html, savedState]);

  // Forward the component's bridge messages to Desktop.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const win = iframeRef.current?.contentWindow;
      if (e.source !== win) return;
      const d = e.data as {
        type?: string;
        state?: string | null;
        request?: string;
        id?: string;
        spec?: unknown;
        w?: number;
        h?: number;
        icon?: string;
        app?: { name?: string; description?: string; icon?: string };
      };
      switch (d?.type) {
        case "CALEIDOS_CLOSE":
          onClose(surfaceId);
          break;
        case "CALEIDOS_SAVE":
          onSave(surfaceId, d.state ?? null);
          break;
        case "CALEIDOS_CHANGE":
          onChange(surfaceId, d.request || "update this component");
          break;
        case "CALEIDOS_ICON":
          if (d.icon) onIcon(surfaceId, d.icon);
          break;
        case "CALEIDOS_INSTALL":
          if (d.app) onInstall(d.app);
          break;
        case "CALEIDOS_RESIZE":
          if (d.w && d.h && d.w > 60 && d.h > 40 && d.w < 1600 && d.h < 1200) {
            setSize({ w: d.w, h: d.h });
          }
          break;
        case "CALEIDOS_FETCH":
          onFetch(d.spec)
            .then((data) =>
              win?.postMessage({ type: "CALEIDOS_FETCH_RESULT", id: d.id, data }, "*"),
            )
            .catch((err) =>
              win?.postMessage(
                {
                  type: "CALEIDOS_FETCH_RESULT",
                  id: d.id,
                  error: err instanceof Error ? err.message : "fetch failed",
                },
                "*",
              ),
            );
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [surfaceId, onClose, onSave, onChange, onFetch, onIcon, onInstall]);

  // Until the HTML exists (first create still streaming in the terminal overlay),
  // render nothing on the desktop. The component appears only when ready.
  if (!html) return null;

  return (
    <motion.div
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      // Minimized: hide visually but keep the iframe mounted so the component's
      // live state survives (display:none, not unmount).
      style={{ zIndex, display: minimized ? "none" : undefined }}
      onPointerDown={() => onFocus(surfaceId)}
      className="absolute left-0 top-0"
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: size.w, height: size.h }}
      >
        {/* thin top drag strip; the component's own UI sits beneath it */}
        <div
          onPointerDown={(e) => controls.start(e)}
          className="absolute left-0 right-0 top-0 z-20 h-2 cursor-grab active:cursor-grabbing"
        />
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          className="h-full w-full border-0"
          title={name}
        />
      </div>
    </motion.div>
  );
}
