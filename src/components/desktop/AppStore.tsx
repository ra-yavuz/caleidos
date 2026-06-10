"use client";

import { useCallback, useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { Icon } from "./Icon";
import type { AppListing, ProviderId } from "@/types/os";

// The infinite App Store: a FRAMEWORK panel (search box, result list, install
// button). The search term is sent to the model, which returns a JSON array of
// app listings, so there are never "no results" - the inventory is imaginary and
// unlimited. Install registers the app (generated on first open). Results
// generation goes through the provider abstraction, so the local model works.
export function AppStore({
  provider,
  installedIds,
  onInstall,
  onClose,
}: {
  provider: ProviderId;
  installedIds: Set<string>;
  onInstall: (app: { name: string; description: string; icon: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AppListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "appstore", request: q, provider }),
      });
      if (!resp.ok || !resp.body) {
        setError(`store search failed (${resp.status})`);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
      }
      if (out.includes("CALEIDOS_ERROR")) {
        setError(out.replace(/[\s\S]*CALEIDOS_ERROR:/, "").replace(/-->[\s\S]*/, "").trim());
        return;
      }
      const listings = parseListings(out);
      if (listings.length === 0) {
        setError("the store returned nothing readable; try another search");
      } else {
        setResults(listings);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query, loading, provider]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/40 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[78vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-800">app store</h2>
          <button onClick={onClose} aria-label="close" className="text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-black/10 p-3">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
              placeholder="search any app you can imagine..."
              className="flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
            />
            <button
              onClick={search}
              disabled={loading || !query.trim()}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "search"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading && (
            <p className="py-8 text-center text-sm text-neutral-400">summoning apps from another dimension...</p>
          )}
          {error && !loading && <p className="py-6 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-400">
              search for anything. the store has infinite inventory.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {results.map((app, i) => {
              const justInstalled = installed.has(app.name);
              const already = installedIds.has(slug(app.name));
              return (
                <div
                  key={`${app.name}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                    <Icon icon={app.icon} className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{app.name}</p>
                    <p className="truncate text-xs text-neutral-500">{app.description}</p>
                  </div>
                  <button
                    disabled={justInstalled || already}
                    onClick={() => {
                      onInstall({ name: app.name, description: app.description, icon: app.icon });
                      setInstalled((prev) => new Set(prev).add(app.name));
                    }}
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                    style={{ background: "var(--accent, #111827)" }}
                  >
                    {justInstalled || already ? "installed" : "get"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "app";
}

// Parse the model's listings. Tolerant: extract the first JSON array, validate
// each entry, drop malformed ones.
function parseListings(raw: string): AppListing[] {
  let text = raw.trim();
  // strip markdown fences if present
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.name === "string")
      .map((x) => ({
        name: String(x.name).slice(0, 60),
        description: typeof x.description === "string" ? x.description.slice(0, 160) : "",
        icon: typeof x.icon === "string" ? x.icon : "",
      }));
  } catch {
    return [];
  }
}
