// Provider abstraction for caleiDOS. Each provider takes a system prompt + a
// single user message and returns an async iterable of text chunks (the HTML
// document, streamed). Three providers:
//
//   subscription : Claude via the user's `claude auth login` (no API key). Uses
//                  the agent-sdk's query() in a one-shot, non-agentic mode. This
//                  is the only way to use the Max subscription, because the raw
//                  Messages API rejects subscription OAuth tokens.
//   apikey       : Claude via the plain Messages API + ANTHROPIC_API_KEY. The
//                  fast/cheap Haiku path. Optional; only works if a key is set.
//   hydra        : a local model via hydra-llm's OpenAI-compatible /v1 endpoint.
//                  Keyless, local. Reached at HYDRA_BASE_URL (host.docker.internal
//                  from inside the container).
//
// All three yield plain text chunks; the route concatenates them and the client
// renders the assembled HTML.

import type { ProviderId } from "@/types/os";
export type { ProviderId };

export type RenderRequest = {
  system: string;
  user: string;
};

// --- subscription: invoke the `claude` CLI in print mode (no key, uses the
// `claude auth login` subscription) ---
//
// We do NOT use the agent-SDK's query() here. That runs a multi-turn AGENT loop
// which made the model emit a component across 2-4 sequential round-trips
// (measured 26-170s, with the long tail closing the socket). `claude -p` is a
// single-shot completion (num_turns:1), which is what we want: one document, one
// pass. We stream its stream-json output and yield the assistant text deltas.
async function* streamSubscription(
  req: RenderRequest,
): AsyncGenerator<string> {
  const { spawn } = await import("node:child_process");

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose", // required for stream-json
    "--append-system-prompt",
    req.system,
  ];
  const model = process.env.CALEIDOS_SUBSCRIPTION_MODEL;
  if (model) args.push("--model", model);

  const child = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  // the prompt goes in on stdin (avoids the "no stdin data" wait and arg limits)
  child.stdin.write(req.user);
  child.stdin.end();

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  // Bridge the child's stdout (newline-delimited JSON) into this async generator.
  const queue: string[] = [];
  let resolveWaiter: (() => void) | null = null;
  let done = false;
  let failed: Error | null = null;
  let buffer = "";

  function handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // ignore non-JSON noise
    }
    if (msg.type === "assistant") {
      const inner = msg.message as { content?: unknown[] } | undefined;
      const content = Array.isArray(inner?.content) ? inner!.content : [];
      for (const raw of content) {
        const block = raw as Record<string, unknown>;
        if (block.type === "text" && typeof block.text === "string") {
          queue.push(block.text);
        }
      }
    } else if (msg.type === "result" && msg.is_error) {
      failed = new Error(
        typeof msg.result === "string" ? msg.result : "claude returned an error",
      );
    }
    resolveWaiter?.();
  }

  child.stdout.on("data", (d) => {
    buffer += d.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
    resolveWaiter?.();
  });
  child.on("close", (code) => {
    if (buffer) handleLine(buffer);
    if (code !== 0 && !failed && queue.length === 0) {
      failed = new Error(
        "claude exited with code " + code + (stderr ? ": " + stderr.slice(0, 300) : ""),
      );
    }
    done = true;
    resolveWaiter?.();
  });
  child.on("error", (e) => {
    failed = e instanceof Error ? e : new Error(String(e));
    done = true;
    resolveWaiter?.();
  });

  for (;;) {
    if (queue.length > 0) {
      yield queue.shift() as string;
      continue;
    }
    if (failed) throw failed;
    if (done) return;
    await new Promise<void>((resolve) => {
      resolveWaiter = resolve;
    });
    resolveWaiter = null;
  }
}

// --- apikey: plain Messages API + ANTHROPIC_API_KEY (fast Haiku path) ---
async function* streamApiKey(req: RenderRequest): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set; the api-key provider is unavailable. Use the subscription or local provider, or set a key.",
    );
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.create({
    model: process.env.CALEIDOS_ANTHROPIC_MODEL || "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      // Cache the large, stable UI contract so repeated interactions read it
      // from cache instead of re-billing the full prompt every click.
      { type: "text", text: req.system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: req.user }],
    stream: true,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// --- hydra: local model via hydra-llm OpenAI-compatible /v1 (keyless) ---
async function* streamHydra(req: RenderRequest): AsyncGenerator<string> {
  // host.docker.internal lets the container reach hydra-llm running on the host.
  const base =
    process.env.HYDRA_BASE_URL || "http://host.docker.internal:18080/v1";
  const model = process.env.HYDRA_MODEL || "local";

  const resp = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 4096,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `hydra-llm request failed (${resp.status}) at ${base}. Is a model running? ${detail.slice(0, 200)}`,
    );
  }

  // Parse OpenAI-style SSE: lines of "data: {json}\n", terminated by "data: [DONE]".
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // ignore partial/garbled SSE line
      }
    }
  }
}

export function streamProvider(
  provider: ProviderId,
  req: RenderRequest,
): AsyncGenerator<string> {
  switch (provider) {
    case "apikey":
      return streamApiKey(req);
    case "hydra":
      return streamHydra(req);
    case "subscription":
    default:
      return streamSubscription(req);
  }
}
