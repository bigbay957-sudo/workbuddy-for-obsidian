import { describe, expect, it } from "vitest";
import { dedupeSources, extractSourceReferences } from "../src/core/source-links";

describe("source links", () => {
  it("extracts vault headings and web URLs", () => {
    const sources = extractSourceReferences(
      "已读取 项目/方案.md#服务标准，并参考 https://example.com/report。",
      ["项目/方案.md", "其他.md"]
    );
    expect(sources).toEqual([
      { kind: "web", label: "https://example.com/report", url: "https://example.com/report" },
      { kind: "vault", label: "项目/方案.md#服务标准", path: "项目/方案.md", heading: "服务标准", line: undefined }
    ]);
  });

  it("deduplicates repeated references", () => {
    const source = { kind: "vault" as const, label: "a.md", path: "a.md" };
    expect(dedupeSources([source, source])).toHaveLength(1);
  });
});
