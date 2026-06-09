"use client";

import { motion, useDragControls } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildSrcdoc } from "@/lib/ui-contract";
import type { ProviderId, SurfaceKind } from "@/types/os";

// A chromeless, draggable surface hosting one model-created component. The
// framework imposes NO window chrome: the component owns its entire look,
// including its own frame and close button. The host only provides position,
// z-order, drag (from anywhere, since there is no title bar), and the bridge
// that lets the component close itself, persist state, request changes, and
// fetch data.
//
// The model is invoked ONCE to create the component (or on an explicit change).
// After that the component runs its own JS locally; clicks never round-trip.
export function ComponentSurface({
  surfaceId,
  kind,
  name,
  description,
  provider,
  initialState,
  initialHtml,
  pos,
  zIndex,
  onClose,
  onFocus,
  onPersist,
}: {
  surfaceId: string;
  kind: SurfaceKind;
  name: string;
  description: string;
  provider: ProviderId;
  initialState: string | null;
  initialHtml: string | null;
  pos: { x: number; y: number };
  zIndex: number;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onPersist: (id: string, state: string | null, html: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const controls = useDragControls();
  const htmlRef = useRef<string | null>(initialHtml);
  const stateRef = useRef<string | null>(initialState);
  const [loading, setLoading] = useState(!initialHtml);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>(
    kind === "widget" ? { w: 240, h: 180 } : { w: 380, h: 460 },
  );
  const busyRef = useRef(false);

  // Generate (or regenerate) the component via the model. Called on first create
  // and on an explicit change request only.
  const generate = useCallback(
    async (changeRequest?: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "component",
            surfaceKind: kind,
            appName: name,
            appDescription: description,
            currentState: stateRef.current,
            request: changeRequest,
            action: changeRequest ? "change" : "__init__",
            provider,
          }),
        });
        if (!resp.ok || !resp.body) {
          setError(`generate failed (${resp.status})`);
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let html = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
        }
        const err = html.match(/<!--CALEIDOS_ERROR:([\s\S]*?)-->/);
        if (err) {
          setError(err[1]);
          return;
        }
        htmlRef.current = html;
        if (iframeRef.current) {
          iframeRef.current.srcdoc = buildSrcdoc(html, stateRef.current);
        }
        onPersist(surfaceId, stateRef.current, html);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [surfaceId, kind, name, description, provider, onPersist],
  );

  // Boot: stored HTML -> show instantly (no model call). Else create once.
  useEffect(() => {
    if (initialHtml && iframeRef.current) {
      iframeRef.current.srcdoc = buildSrcdoc(initialHtml, initialState);
    } else {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host API: handle the component's bridge messages.
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
      };
      switch (d?.type) {
        case "CALEIDOS_CLOSE":
          onClose(surfaceId);
          break;
        case "CALEIDOS_SAVE":
          stateRef.current = d.state ?? null;
          onPersist(surfaceId, stateRef.current, htmlRef.current ?? "");
          break;
        case "CALEIDOS_CHANGE":
          generate(d.request || "update this component");
          break;
        case "CALEIDOS_RESIZE": {
          const rw = (d as { w?: number }).w;
          const rh = (d as { h?: number }).h;
          if (rw && rh && rw > 60 && rh > 40 && rw < 1600 && rh < 1200) {
            setSize({ w: rw, h: rh });
          }
          break;
        }
        case "CALEIDOS_FETCH":
          // host-mediated data fetch (sandbox has no network of its own)
          fetch("/api/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spec: d.spec, provider }),
          })
            .then((r) => r.json())
            .then((data) =>
              win?.postMessage(
                { type: "CALEIDOS_FETCH_RESULT", id: d.id, data },
                "*",
              ),
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
  }, [surfaceId, provider, onClose, onPersist, generate]);

  return (
    <motion.div
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ zIndex }}
      onPointerDown={() => onFocus(surfaceId)}
      className="absolute left-0 top-0"
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: size.w, height: size.h }}
      >
        {/* a thin drag strip along the top edge: drag without imposing chrome.
            The component's own UI sits beneath it. */}
        <div
          onPointerDown={(e) => controls.start(e)}
          className="absolute left-0 right-0 top-0 z-20 h-2 cursor-grab active:cursor-grabbing"
          title="drag"
        />
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          className="h-full w-full border-0"
          title={name}
        />
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-neutral-900/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-xs text-white/70">creating {name}...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 overflow-auto rounded-2xl bg-white p-4 text-sm">
            <p className="font-medium text-red-600">create error</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-500">{error}</pre>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => generate()}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white"
              >
                retry
              </button>
              <button
                onClick={() => onClose(surfaceId)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600"
              >
                close
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
