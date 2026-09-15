import { describe, expect, it } from "vitest";
import {
  THOUGHT_LANGUAGE_ZH_INSTRUCTION,
  buildThoughtLanguageInstruction,
  normalizeThoughtLanguage
} from "../src/core/thought-language";
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "../src/types";

describe("normalizeThoughtLanguage", () => {
  it("keeps the two valid values", () => {
    expect(normalizeThoughtLanguage("zh")).toBe("zh");
    expect(normalizeThoughtLanguage("model")).toBe("model");
  });

  it("falls back to zh for missing or unknown values", () => {
    expect(normalizeThoughtLanguage(undefined)).toBe("zh");
    expect(normalizeThoughtLanguage("")).toBe("zh");
    expect(normalizeThoughtLanguage("en")).toBe("zh");
    expect(normalizeThoughtLanguage("ZH")).toBe("zh");
  });
});

describe("buildThoughtLanguageInstruction", () => {
  it("returns the Chinese instruction by default", () => {
    expect(buildThoughtLanguageInstruction(undefined)).toBe(THOUGHT_LANGUAGE_ZH_INSTRUCTION);
    expect(buildThoughtLanguageInstruction("zh")).toBe(THOUGHT_LANGUAGE_ZH_INSTRUCTION);
  });

  it("returns an empty string when following the model default", () => {
    expect(buildThoughtLanguageInstruction("model")).toBe("");
  });

  it("names both reasoning and thinking channels", () => {
    expect(THOUGHT_LANGUAGE_ZH_INSTRUCTION).toContain("reasoning");
    expect(THOUGHT_LANGUAGE_ZH_INSTRUCTION).toContain("thinking");
  });

  it("guards the common failure case of English source material", () => {
    // 模型读英文文件/命令输出时最容易切回英文推理，提示词必须显式覆盖这一场景
    expect(THOUGHT_LANGUAGE_ZH_INSTRUCTION).toContain("英文");
  });

  it("asks to keep code, commands and paths untranslated", () => {
    expect(THOUGHT_LANGUAGE_ZH_INSTRUCTION).toContain("不要翻译");
  });
});

describe("settings wiring", () => {
  it("defaults to Chinese thought output", () => {
    expect(DEFAULT_SETTINGS.thoughtLanguage).toBe("zh");
  });

  it("bumped the settings version so existing installs get the new defaults", () => {
    expect(SETTINGS_VERSION).toBe(5);
    expect(DEFAULT_SETTINGS.settingsVersion).toBe(SETTINGS_VERSION);
  });

  it("expands the thought block by default", () => {
    // v0.9.7：思考过程不再需要每次手点展开
    expect(DEFAULT_SETTINGS.thoughtExpanded).toBe(true);
  });
});
