import { DEFAULT_SETTINGS } from "../types";

const THOUGHT_SIZE_VAR = "--wb-thought-size";
const BODY_SIZE_VAR = "--wb-body-size";
const BODY_FONT_VAR = "--wb-body-font";

/**
 * 互联网产品常见的无衬线字体栈：拉丁字符优先 SF Pro / Inter，
 * 中文回落到苹方（macOS）、HarmonyOS Sans（鸿蒙）、微软雅黑（Windows）。
 * 中文字体必须排在拉丁字体之后，否则西文会被中文字体接管、失去字形细节。
 */
export const SANS_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", system-ui, "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

export type BodyFontFamily = "sans" | "theme";

export function normalizeThoughtFontSize(size: number | undefined): number {
  if (!size || !Number.isFinite(size)) return DEFAULT_SETTINGS.thoughtFontSize;
  return Math.min(18, Math.max(9, Math.round(size)));
}

export function applyThoughtFontSize(size: number | undefined): void {
  const px = normalizeThoughtFontSize(size);
  document.documentElement.style.setProperty(THOUGHT_SIZE_VAR, `${px}px`);
}

export function normalizeBodyFontSize(size: number | undefined): number {
  if (!size || !Number.isFinite(size)) return DEFAULT_SETTINGS.bodyFontSize;
  return Math.min(18, Math.max(11, Math.round(size)));
}

export function applyBodyFontSize(size: number | undefined): void {
  const px = normalizeBodyFontSize(size);
  document.documentElement.style.setProperty(BODY_SIZE_VAR, `${px}px`);
}

export function normalizeBodyFontFamily(family: string | undefined): BodyFontFamily {
  return family === "theme" ? "theme" : "sans";
}

export function applyBodyFontFamily(family: string | undefined): void {
  const value = normalizeBodyFontFamily(family) === "theme" ? "inherit" : SANS_FONT_STACK;
  document.documentElement.style.setProperty(BODY_FONT_VAR, value);
}
