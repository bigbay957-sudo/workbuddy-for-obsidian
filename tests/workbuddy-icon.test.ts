import { describe, expect, it } from "vitest";
import { WORKBUDDY_ICON_ID, WORKBUDDY_ICON_SVG } from "../src/core/workbuddy-icon";

describe("official WorkBuddy icon", () => {
  it("uses the official silhouette while inheriting Obsidian's theme color", () => {
    expect(WORKBUDDY_ICON_ID).toBe("workbuddy-official");
    expect(WORKBUDDY_ICON_SVG).toContain('fill="currentColor"');
    expect(WORKBUDDY_ICON_SVG).toContain("<path");
    expect(WORKBUDDY_ICON_SVG).not.toContain("<rect");
    expect(WORKBUDDY_ICON_SVG).not.toContain("#00BC90");
    expect(WORKBUDDY_ICON_SVG).not.toContain("<image");
    expect(WORKBUDDY_ICON_SVG).not.toContain("data:image");
  });
});
