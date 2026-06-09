import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import { APP_CONTRACT_PROMPT, mapSDKMessageToBuildEvents } from "@/lib/agent-events";
import type { BuildEvent } from "@/types/build-events";

export const runtime = "nodejs";
export const maxDuration = 300;

// Where the agent builds. cwd is the apps directory so the contract's relative
// <slug>/index.tsx paths resolve correctly. process.cwd() is /app in the
// container; apps/ is bind-mounted to the host.
const APPS_DIR = path.join(process.cwd(), "apps");

export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    if (typeof body.prompt === "string") prompt = body.prompt.trim();
  } catch {
    // fall through to empty-prompt guard
  }

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const options: Options = {
    cwd: APPS_DIR,
    permissionMode: "bypassPermissions",
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: APP_CONTRACT_PROMPT,
    },
    maxTurns: 30,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BuildEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const message of query({ prompt, options })) {
          for (const event of mapSDKMessageToBuildEvents(message)) send(event);
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
