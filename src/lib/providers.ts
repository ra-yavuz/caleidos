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

// --- subscription: agent-sdk one-shot (no key, uses claude auth login) ---
async function* streamSubscription(
  req: RenderRequest,
): AsyncGenerator<string> {
  // Imported lazily so the apikey/hydra paths don't pay for loading the heavy
  // agent SDK, and so a missing binary only errors when this path is used.
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  // One-shot generation: no tools, no file writes. We only want the model's
  // text. The UI contract goes in systemPrompt (append to the preset), the
  // per-turn instruction is the prompt. permissionMode is irrelevant with no
  // tools, but we disable tool use by not granting any.
  const iterator = query({
    prompt: req.user,
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: req.system,
      },
      // No tools: pure text generation. The model cannot touch the filesystem.
      allowedTools: [],
      permissionMode: "bypassPermissions",
      maxTurns: 1,
    },
  });

  for await (const message of iterator as AsyncIterable<unknown>) {
    const m = message as Record<string, unknown>;
    if (m.type === "assistant") {
      const inner = m.message as { content?: unknown[] } | undefined;
      const content = Array.isArray(inner?.content) ? inner!.content : [];
      for (const raw of content) {
        const block = raw as Record<string, unknown>;
        if (block.type === "text" && typeof block.text === "string") {
          yield block.text;
        }
      }
    }
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
