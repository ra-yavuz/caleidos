// Events streamed from /api/build to the UI as the agent works. One JSON
// object per newline-delimited line of the response body.

export type StatusEvent = { type: "status"; text: string; sessionId?: string };
export type TextEvent = { type: "text"; text: string };
export type ToolUseEvent = {
  type: "tool_use";
  toolId: string;
  name: string;
  summary: string;
};
export type FileWriteEvent = { type: "file_write"; toolId: string; path: string };
export type DoneEvent = { type: "done"; durationMs?: number };
export type ErrorEvent = { type: "error"; message: string };

export type BuildEvent =
  | StatusEvent
  | TextEvent
  | ToolUseEvent
  | FileWriteEvent
  | DoneEvent
  | ErrorEvent;
