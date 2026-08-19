import { describe, expect, it } from "vitest";
import { computeTextDiff } from "../src/core/text-diff";

describe("computeTextDiff", () => {
  it("extracts shared context and changed text", () => {
    expect(computeTextDiff("项目需要优化", "项目值得优化")).toEqual({ before: "项目", removed: "需要", added: "值得", after: "优化" });
  });

  it("handles insertion-only changes", () => {
    expect(computeTextDiff("abc", "abXYc")).toEqual({ before: "ab", removed: "", added: "XY", after: "c" });
  });
});
