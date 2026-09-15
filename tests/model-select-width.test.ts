import { describe, expect, it } from "vitest";
import {
  MODEL_SELECT_CHROME_WIDTH,
  MODEL_SELECT_MAX_WIDTH,
  MODEL_SELECT_MIN_WIDTH,
  computeModelSelectWidth
} from "../src/ui/model-select-width";

describe("model select width", () => {
  it("keeps the minimum width for short model names", () => {
    expect(computeModelSelectWidth(10)).toBe(MODEL_SELECT_MIN_WIDTH);
    expect(computeModelSelectWidth(0)).toBe(MODEL_SELECT_MIN_WIDTH);
  });

  it("falls back to the minimum width for invalid measurements", () => {
    expect(computeModelSelectWidth(Number.NaN)).toBe(MODEL_SELECT_MIN_WIDTH);
    expect(computeModelSelectWidth(-5)).toBe(MODEL_SELECT_MIN_WIDTH);
  });

  it("adds the chrome overhead for a medium name and lets it grow past the minimum", () => {
    const width = computeModelSelectWidth(120);
    expect(width).toBe(120 + MODEL_SELECT_CHROME_WIDTH);
    expect(width).toBeGreaterThan(MODEL_SELECT_MIN_WIDTH);
    expect(width).toBeLessThan(MODEL_SELECT_MAX_WIDTH);
  });

  it("clamps very long names so the toolbar keeps room for the other buttons", () => {
    expect(computeModelSelectWidth(600)).toBe(MODEL_SELECT_MAX_WIDTH);
  });

  it("rounds fractional measurements up", () => {
    expect(computeModelSelectWidth(100.2)).toBe(101 + MODEL_SELECT_CHROME_WIDTH);
  });
});
