import { describe, expect, it } from "vitest";
import { MAX_WORKBUDDY_TASKS, canAddWorkBuddyTask } from "../src/core/task-pages";

describe("WorkBuddy task page limit", () => {
  it("allows the first five task pages", () => {
    expect(MAX_WORKBUDDY_TASKS).toBe(5);
    expect(canAddWorkBuddyTask(0)).toBe(true);
    expect(canAddWorkBuddyTask(4)).toBe(true);
  });

  it("blocks a sixth task page and invalid counts", () => {
    expect(canAddWorkBuddyTask(5)).toBe(false);
    expect(canAddWorkBuddyTask(6)).toBe(false);
    expect(canAddWorkBuddyTask(-1)).toBe(false);
  });
});
