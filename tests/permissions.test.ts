import { describe, expect, it } from "vitest";
import { chooseAutomaticPermission, isSafeReadPermission } from "../src/core/permissions";
import type { PermissionPrompt } from "../src/types";

const options = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" }
];

describe("permission policy", () => {
  it("auto-allows read tools in read-only modes", () => {
    const prompt: PermissionPrompt = { toolName: "Read", title: "读取笔记", rawInput: {}, options };
    expect(isSafeReadPermission(prompt)).toBe(true);
    expect(chooseAutomaticPermission("ask", prompt)).toBe("allow");
  });

  it("rejects mutating tools outside work mode", () => {
    const prompt: PermissionPrompt = { toolName: "Edit", title: "修改文件", rawInput: {}, options };
    expect(chooseAutomaticPermission("plan", prompt)).toBe("reject");
  });

  it("asks the user in work mode", () => {
    const prompt: PermissionPrompt = { toolName: "Bash", title: "执行测试", rawInput: {}, options };
    expect(chooseAutomaticPermission("work", prompt)).toBeNull();
  });
});
