export const runtime = "nodejs";
export const maxDuration = 30;

// Host-mediated data fetch. Components run in a sandboxed iframe with NO network
// of their own, so when a component calls caleidos.fetchData(spec) the host
// performs the request here on its behalf and returns the result.
//
// spec kinds:
//   { kind: "http", url, method?, headers?, body? }  generic HTTP GET/POST
//   { kind: "time", tz? }                            current time (server clock)
// Other kinds return an error so the component can degrade gracefully.
//
// Safety: only http(s) URLs; block obvious internal targets so a hallucinated
// component cannot probe the host's private network.

type Spec =
  | { kind: "http"; url?: string; method?: string; headers?: Record<string, string>; body?: string }
  | { kind: "time"; tz?: string }
  | { kind: string; [k: string]: unknown };

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "host.docker.internal" ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
    h === "0.0.0.0" ||
    h === "::1"
  );
}

export async function POST(req: Request) {
  let body: { spec?: Spec };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const spec = body.spec;
  if (!spec || typeof spec !== "object" || !("kind" in spec)) {
    return Response.json({ error: "spec required" }, { status: 400 });
  }

  if (spec.kind === "time") {
    const tz = (spec as { tz?: string }).tz;
    try {
      const now = new Date();
      return Response.json({
        iso: now.toISOString(),
        epoch: now.getTime(),
        formatted: tz
          ? now.toLocaleString("en-US", { timeZone: tz })
          : now.toLocaleString(),
      });
    } catch {
      return Response.json({ iso: new Date().toISOString() });
    }
  }

  if (spec.kind === "http") {
    const s = spec as { url?: string; method?: string; headers?: Record<string, string>; body?: string };
    if (!s.url || typeof s.url !== "string") {
      return Response.json({ error: "url required" }, { status: 400 });
    }
    let u: URL;
    try {
      u = new URL(s.url);
    } catch {
      return Response.json({ error: "bad url" }, { status: 400 });
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return Response.json({ error: "only http(s)" }, { status: 400 });
    }
    if (isBlockedHost(u.hostname)) {
      return Response.json({ error: "host not allowed" }, { status: 403 });
    }
    try {
      const r = await fetch(u.toString(), {
        method: s.method && /^(GET|POST)$/i.test(s.method) ? s.method : "GET",
        headers: s.headers || undefined,
        body: s.body || undefined,
        signal: AbortSignal.timeout(20000),
      });
      const text = await r.text();
      const ct = r.headers.get("content-type") || "";
      let data: unknown = text;
      if (ct.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      // cap payload size returned to the component
      const capped =
        typeof data === "string" && data.length > 200000
          ? data.slice(0, 200000)
          : data;
      return Response.json({ status: r.status, data: capped });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "fetch failed" },
        { status: 502 },
      );
    }
  }

  return Response.json({ error: `unsupported kind: ${spec.kind}` }, { status: 400 });
}
