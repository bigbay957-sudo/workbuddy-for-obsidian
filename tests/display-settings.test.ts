import { beforeEach, describe, expect, it } from "vitest";
import {
  SANS_FONT_STACK,
  applyBodyFontFamily,
  applyBodyFontSize,
  normalizeBodyFontFamily,
  normalizeBodyFontSize,
  normalizeThoughtFontSize
} from "../src/ui/display-settings";
import { DEFAULT_SETTINGS } from "../src/types";

const vars: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(vars)) delete vars[key];
  (globalThis as unknown as { document: unknown }).document = {
    documentElement: {
      style: {
        setProperty: (name: string, value: string) => {
          vars[name] = value;
        }
      }
    }
  };
});

describe("display settings", () => {
  it("falls back to the default body size for empty or invalid input", () => {
    expect(normalizeBodyFontSize(undefined)).toBe(DEFAULT_SETTINGS.bodyFontSize);
    expect(normalizeBodyFontSize(0)).toBe(DEFAULT_SETTINGS.bodyFontSize);
    expect(normalizeBodyFontSize(Number.NaN)).toBe(DEFAULT_SETTINGS.bodyFontSize);
  });

  it("clamps the body size into the readable 11-18px range", () => {
    expect(normalizeBodyFontSize(6)).toBe(11);
    expect(normalizeBodyFontSize(30)).toBe(18);
    expect(normalizeBodyFontSize(13.4)).toBe(13);
  });

  it("writes the body size to the document root variable", () => {
    applyBodyFontSize(14);
    expect(vars["--wb-body-size"]).toBe("14px");
  });

  it("defaults to the sans stack and only uses inherit for the theme option", () => {
    expect(normalizeBodyFontFamily(undefined)).toBe("sans");
    expect(normalizeBodyFontFamily("nonsense")).toBe("sans");

    applyBodyFontFamily("theme");
    expect(vars["--wb-body-font"]).toBe("inherit");

    applyBodyFontFamily("sans");
    expect(vars["--wb-body-font"]).toBe(SANS_FONT_STACK);
  });

  it("keeps the sans stack latin-first so CJK fonts stay as fallback", () => {
    expect(SANS_FONT_STACK.indexOf("Inter")).toBeLessThan(SANS_FONT_STACK.indexOf("PingFang SC"));
  });

  it("keeps the existing thought size behaviour intact", () => {
    expect(normalizeThoughtFontSize(undefined)).toBe(DEFAULT_SETTINGS.thoughtFontSize);
    expect(normalizeThoughtFontSize(9)).toBe(9);
    expect(normalizeThoughtFontSize(99)).toBe(18);
  });
});
