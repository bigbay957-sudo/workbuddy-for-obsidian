import { describe, expect, it } from "vitest";
import { compareVersions, normalizeGitHubRepository, normalizeVersion } from "../src/core/version";

describe("version helpers", () => {
  it("compares semantic versions", () => {
    expect(compareVersions("0.7.0", "0.6.9")).toBe(1);
    expect(compareVersions("v1.0.0", "1.0")).toBe(0);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(normalizeVersion("v1.2.3-beta.1")).toBe("1.2.3");
  });

  it("accepts only a GitHub owner/repository path", () => {
    expect(normalizeGitHubRepository("https://github.com/bigbay/workbuddy-for-obsidian.git")).toBe("bigbay/workbuddy-for-obsidian");
    expect(normalizeGitHubRepository("bigbay/workbuddy-for-obsidian")).toBe("bigbay/workbuddy-for-obsidian");
    expect(normalizeGitHubRepository("https://example.com/repo")).toBeNull();
  });
});
