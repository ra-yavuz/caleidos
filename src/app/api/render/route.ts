import {
  UI_CONTRACT_PROMPT,
  BACKGROUND_PROMPT,
  THEME_PROMPT,
  APPSTORE_PROMPT,
  PAGE_PROMPT,
} from "@/lib/ui-contract";
import { streamProvider, type ProviderId } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

// The model is invoked only to CREATE/CHANGE a component, generate a
// background/theme, return App Store listings for a search, or render a browser
// page. All paths go through streamProvider so the local provider works too.
type RenderBody = {
  target?: "component" | "background" | "theme" | "appstore" | "page";
  surfaceKind?: "app" | "widget";
  appName?: string;
  appDescription?: string;
  currentState?: string | null; // carried so a change can preserve user data
  action?: string; // "__init__" to create, "change" for an explicit change
  request?: string; // change wording, background/theme/appstore/page query
  provider?: ProviderId;
};

function buildComponentMessage(body: RenderBody): string {
  const isCreate = !body.action || body.action === "__init__";
  return JSON.stringify({
    build: body.surfaceKind === "widget" ? "WIDGET" : "APP",
    identity: {
      name: body.appName || "untitled",
      description: body.appDescription || "",
    },
    savedState: body.currentState ?? null,
    mode: isCreate ? "create" : "change",
    changeRequest: isCreate ? null : body.request || "update this component",
    note: isCreate
      ? "Create this component fresh. Write a complete, self-contained interactive component (HTML+CSS+JS) with its own frame and controls. Call caleidos.resize(w,h) on load."
      : "Rebuild this component incorporating the change. Preserve the user's saved state/data where it still makes sense. Call caleidos.resize(w,h) on load.",
  });
}

export async function POST(req: Request) {
  let body: RenderBody;
  try {
    body = (await req.json()) as RenderBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provider: ProviderId = body.provider || "subscription";
  const target = body.target || "component";

  let system: string;
  let user: string;
  if (target === "background") {
    system = BACKGROUND_PROMPT;
    user = body.request || "A calm, atmospheric desktop background.";
  } else if (target === "theme") {
    system = THEME_PROMPT;
    user = body.request || "A coherent, tasteful theme.";
  } else if (target === "appstore") {
    system = APPSTORE_PROMPT;
    user = "Search query: " + (body.request || "popular apps");
  } else if (target === "page") {
    system = PAGE_PROMPT;
    user =
      "Render the page for this address-bar query or URL: " +
      (body.request || "home");
  } else {
    if (!body.appName) {
      return new Response(JSON.stringify({ error: "appName is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    system = UI_CONTRACT_PROMPT;
    user = buildComponentMessage(body);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamProvider(provider, { system, user })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const safe = message.split("--").join("__");
        controller.enqueue(encoder.encode("<!--CALEIDOS_ERROR:" + safe + "-->"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Caleidos-Provider": provider,
    },
  });
}
