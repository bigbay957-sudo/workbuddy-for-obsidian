import { describe, expect, it } from "vitest";
import { recommendRelatedNotes, type NoteSignals } from "../src/core/related-notes";

const note = (path: string, overrides: Partial<NoteSignals> = {}): NoteSignals => ({
  path,
  title: path.replace(/\.md$/, ""),
  tags: [],
  headings: [],
  links: [],
  ...overrides
});

describe("related notes", () => {
  it("prioritizes direct links, backlinks and shared tags", () => {
    const current = note("项目/投标方案.md", { tags: ["#投标"], links: ["案例/车库案例.md"] });
    const results = recommendRelatedNotes(current, [
      note("案例/车库案例.md"),
      note("会议/复盘.md", { links: ["项目/投标方案.md"] }),
      note("资料/标书.md", { tags: ["#投标"] })
    ]);
    expect(results.map((item) => item.path)).toEqual(["案例/车库案例.md", "会议/复盘.md", "资料/标书.md"]);
  });

  it("returns only scored notes and respects the limit", () => {
    const results = recommendRelatedNotes(note("项目/广州投标.md"), [
      note("项目/广州方案.md"),
      note("其他/无关.md"),
      note("项目/广州复盘.md")
    ], 1);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toContain("广州");
  });
});
