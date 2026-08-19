import { describe, expect, it } from "vitest";
import { filterWorkTemplates, WORK_TEMPLATES } from "../src/core/work-templates";

describe("work templates", () => {
  it("provides the five built-in property-work templates", () => {
    expect(WORK_TEMPLATES.map((template) => template.name)).toEqual(["会议纪要", "内容润色", "汇报提纲", "案例总结", "执行方案"]);
  });

  it("filters by slash query", () => {
    expect(filterWorkTemplates("/润色").map((template) => template.name)).toEqual(["内容润色"]);
  });
});
