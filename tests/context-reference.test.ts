import { describe, expect, it } from "vitest";
import { extractHeadingSection, isReadableTextExtension } from "../src/core/context-reference";

describe("context references", () => {
  it("extracts one heading section until the next peer heading", () => {
    const markdown = "# 项目\n简介\n## 服务方案\n客服内容\n### 细节\n具体动作\n## 风险\n风险内容";
    expect(extractHeadingSection(markdown, "服务方案", 2)).toBe("## 服务方案\n客服内容\n### 细节\n具体动作");
  });

  it("distinguishes readable text from binary attachments", () => {
    expect(isReadableTextExtension("md")).toBe(true);
    expect(isReadableTextExtension("PDF")).toBe(false);
    expect(isReadableTextExtension("png")).toBe(false);
  });
});
