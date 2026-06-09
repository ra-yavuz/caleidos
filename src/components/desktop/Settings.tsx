"use client";

import { X } from "lucide-react";
import type { ProviderId, Surface } from "@/types/os";

const PROVIDERS: { id: ProviderId; label: string; note: string }[] = [
  {
    id: "subscription",
    label: "Claude (subscription)",
    note: "your claude auth login, no API key",
  },
  {
    id: "apikey",
    label: "Claude (API key)",
    note: "fast Haiku, needs ANTHROPIC_API_KEY",
  },
  {
    id: "hydra",
    label: "Local (hydra-llm)",
    note: "local model, keyless, via host.docker.internal",
  },
];

// Fixed (non-hallucinated) system settings: pick the model provider, manage the
// apps and widgets the OS has stored.
export function Settings({
  provider,
  onProvider,
  storedApps,
  widgets,
  onForget,
  onClose,
}: {
  provider: ProviderId;
  onProvider: (p: ProviderId) => void;
  storedApps: Surface[];
  widgets: Surface[];
  onForget: (id: string, kind: "app" | "widget") => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[min(520px,92vw)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-800">settings</h2>
          <button onClick={onClose} aria-label="close" className="text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              model provider
            </h3>
            <div className="flex flex-col gap-2">
              {PROVIDERS.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${
                    provider === p.id
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    checked={provider === p.id}
                    onChange={() => onProvider(p.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-neutral-800">{p.label}</span>
                    <span className="block text-xs text-neutral-500">{p.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              stored apps
            </h3>
            {storedApps.length === 0 ? (
              <p className="text-xs text-neutral-400">none yet</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {storedApps.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-1.5 text-sm"
                  >
                    <span className="text-neutral-700">{a.name}</span>
                    <button
                      onClick={() => onForget(a.id, "app")}
                      className="text-xs text-red-500 hover:underline"
                    >
                      forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              widgets
            </h3>
            {widgets.length === 0 ? (
              <p className="text-xs text-neutral-400">none yet</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {widgets.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-1.5 text-sm"
                  >
                    <span className="text-neutral-700">{w.name}</span>
                    <button
                      onClick={() => onForget(w.id, "widget")}
                      className="text-xs text-red-500 hover:underline"
                    >
                      forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
