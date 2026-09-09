import { DEFAULT_SETTINGS } from "../types";

const THOUGHT_SIZE_VAR = "--wb-thought-size";

export function normalizeThoughtFontSize(size: number | undefined): number {
  if (!size || !Number.isFinite(size)) return DEFAULT_SETTINGS.thoughtFontSize;
  return Math.min(18, Math.max(9, Math.round(size)));
}

export function applyThoughtFontSize(size: number | undefined): void {
  const px = normalizeThoughtFontSize(size);
  document.documentElement.style.setProperty(THOUGHT_SIZE_VAR, `${px}px`);
}
