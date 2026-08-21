import { describe, expect, it } from "vitest";
import { addClosedChat, buildChatMarkdown, buildFullTaskMarkdown, normalizeWorkspaceState, selectMessages } from "../src/core/chat-persistence";

const message = (id: string, role: "user" | "assistant", text: string) => ({ id, role, text, createdAt: 1 });
const task = (id: string) => ({ id, title: id, inputDraft: "", attachedPaths: [], contextReferences: [], messages: [message(id + "-m", "user", "你好")], updatedAt: 1 });

describe("chat persistence", () => {
  it("repairs an invalid active task and enforces the open-task limit", () => {
    const state = normalizeWorkspaceState({ activeTaskId: "missing", nextTaskId: 9, tasks: Array.from({ length: 7 }, (_, index) => task(`task-${index + 1}`)) });
    expect(state.tasks).toHaveLength(5);
    expect(state.activeTaskId).toBe("task-1");
    expect(state.nextTaskId).toBe(9);
  });

  it("never reuses an existing numeric task id", () => {
    const state = normalizeWorkspaceState({ nextTaskId: 1, tasks: [task("task-5")] });
    expect(state.nextTaskId).toBe(6);
  });

  it("keeps the latest closed chat and de-duplicates by task id", () => {
    const result = addClosedChat([task("task-1"), task("task-2")], { ...task("task-1"), title: "新版" });
    expect(result.map((item) => item.title)).toEqual(["新版", "task-2"]);
  });

  it("selects messages and generates a readable markdown archive", () => {
    const messages = [message("1", "user", "帮我总结"), message("2", "assistant", "结论"), message("3", "user", "忽略")];
    const selected = selectMessages(messages, new Set(["1", "2"]));
    const markdown = buildChatMarkdown("项目复盘", selected, 0);
    expect(markdown).toContain("# 项目复盘");
    expect(markdown).toContain("## WorkBuddy\n\n结论");
    expect(markdown).not.toContain("忽略");
  });

  it("restores typed context references and answer sources", () => {
    const state = normalizeWorkspaceState({
      tasks: [{
        ...task("task-1"),
        contextReferences: [{ id: "tag:#案例", kind: "tag", label: "#案例", tag: "#案例" }],
        messages: [{ ...message("a", "assistant", "完成"), sources: [{ kind: "vault", label: "案例.md", path: "案例.md" }] }]
      }]
    });
    expect(state.tasks[0]?.contextReferences[0]?.tag).toBe("#案例");
    expect(state.tasks[0]?.messages[0]?.sources?.[0]?.path).toBe("案例.md");
  });

  it("exports answer sources into the markdown archive", () => {
    const markdown = buildChatMarkdown("记录", [{
      ...message("a", "assistant", "完成"),
      sources: [{ kind: "vault", label: "项目来源", path: "项目.md", heading: "结论" }]
    }]);
    expect(markdown).toContain("### 参考来源");
    expect(markdown).toContain("[[项目.md#结论|项目来源]]");
  });

  it("restores favorites and tool activities", () => {
    const state = normalizeWorkspaceState({
      tasks: [{
        ...task("task-1"),
        messages: [{
          ...message("a", "assistant", "已完成"),
          favorite: true,
          toolActivities: [{ id: "tool-1", title: "读取文件", status: "完成", detail: "项目.md", createdAt: 1 }]
        }]
      }]
    });
    expect(state.tasks[0]?.messages[0]?.favorite).toBe(true);
    expect(state.tasks[0]?.messages[0]?.toolActivities?.[0]?.title).toBe("读取文件");
  });

  it("exports full task references, favorites and tool operations", () => {
    const markdown = buildFullTaskMarkdown({
      ...task("task-1"),
      title: "广州项目",
      attachedPaths: ["项目/需求.md"],
      contextReferences: [{ id: "tag:#产品", kind: "tag", label: "#产品", tag: "#产品" }],
      messages: [{
        ...message("a", "assistant", "结论"),
        favorite: true,
        toolActivities: [{ id: "t", title: "搜索资料", status: "完成", createdAt: 1 }]
      }]
    }, 0);
    expect(markdown).toContain("## 任务引用资料");
    expect(markdown).toContain("[[项目/需求.md]]");
    expect(markdown).toContain("### 工具操作");
    expect(markdown).toContain("已收藏的重要回答");
  });
});
