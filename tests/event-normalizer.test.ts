import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { normalizeSessionUpdate } from "../src/core/event-normalizer";

describe("normalizeSessionUpdate", () => {
  it("normalizes streamed assistant text", () => {
    const notification = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "你好" }
      }
    } as SessionNotification;

    expect(normalizeSessionUpdate(notification)).toEqual({ type: "agent-text", text: "你好" });
  });

  it("normalizes tool updates", () => {
    const notification = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        title: "搜索网页",
        status: "completed",
        rawOutput: { count: 3 }
      }
    } as SessionNotification;

    expect(normalizeSessionUpdate(notification)).toMatchObject({
      type: "tool",
      id: "tool-1",
      title: "搜索网页",
      status: "completed"
    });
  });
});
