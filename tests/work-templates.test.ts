import { describe, expect, it } from "vitest";
import { filterWorkTemplates, WORK_TEMPLATES } from "../src/core/work-templates";

describe("work templates", () => {
  it("provides the five built-in property-work templates", () => {
    expect(WORK_TEMPLATES.map((template) => template.name)).toEqual(["会议纪要", "标书润色", "述标提纲", "案例总结", "物业方案"]);
  });

  it("filters by slash query", () => {
    expect(filterWorkTemplates("/标书").map((template) => template.name)).toEqual(["标书润色"]);
  });
});
