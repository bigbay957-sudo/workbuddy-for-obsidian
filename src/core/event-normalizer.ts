import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "../types";

export function normalizeSessionUpdate(notification: SessionNotification): RuntimeEvent | null {
  const update = notification.update;

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return update.content.type === "text" ? { type: "agent-text", text: update.content.text } : null;
    case "agent_thought_chunk":
      return update.content.type === "text" ? { type: "thought", text: update.content.text } : null;
    case "tool_call":
      return {
        type: "tool",
        id: update.toolCallId,
        title: update.title,
        status: update.status
      };
    case "tool_call_update":
      return {
        type: "tool",
        id: update.toolCallId,
        title: update.title ?? "工具调用",
        status: update.status ?? undefined,
        detail: summarizeUnknown(update.rawOutput ?? update.rawInput)
      };
    case "plan":
      return { type: "plan", text: summarizeUnknown(update) ?? "计划已更新" };
    case "plan_update":
      return { type: "plan", text: summarizeUnknown(update) ?? "计划已更新" };
    case "usage_update":
      return { type: "usage", text: summarizeUnknown(update) ?? "" };
    default:
      return null;
  }
}

function summarizeUnknown(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.slice(0, 2_000);
  try {
    return JSON.stringify(value).slice(0, 2_000);
  } catch {
    return String(value).slice(0, 2_000);
  }
}
