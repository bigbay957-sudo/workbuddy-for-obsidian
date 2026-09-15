import type { ThoughtLanguage } from "../types";

/**
 * 强制模型用简体中文推理的提示词。
 *
 * 背景：思考过程（thinking / reasoning）是模型自己在内部生成的文本，插件只负责
 * 渲染，无法在 UI 层翻译或改写。多数通用模型（含部分国产模型）的思考通道默认
 * 走英文——尤其是读取英文文件名、代码、命令输出时。ACP 协议与 codebuddy CLI 都
 * 没有语言参数（`--help` 已确认），所以唯一可行的手段是每轮在 prompt 里显式约束。
 *
 * 措辞上有三个刻意的设计：
 * 1. 点名 "reasoning / thinking" 两个词——不同模型对思考通道的称呼不同，都写上
 *    命中率更高；
 * 2. 明确「即使资料是英文也用中文思考」——这是最常见的破功场景，不写就守不住；
 * 3. 声明代码/命令/路径/专有名词保持原样——避免模型为了「中文输出」把文件路径
 *    或标识符也翻译了，造成幻觉或找不到文件。
 */
export const THOUGHT_LANGUAGE_ZH_INSTRUCTION =
  "【思考语言要求】请始终使用简体中文进行思考（reasoning / thinking），推理过程本身也用中文表达；" +
  "即使你读取的文件名、代码、命令输出或搜索结果都是英文，也保持中文推理。" +
  "最终回答同样使用简体中文，但代码、命令、文件路径与专有名词保持原样，不要翻译。";

/** 非法/缺失值一律回落到默认的「简体中文」 */
export function normalizeThoughtLanguage(value: string | undefined): ThoughtLanguage {
  return value === "model" ? "model" : "zh";
}

/**
 * 返回本轮要追加的语言约束；选择「跟随模型默认」时返回空串，
 * 调用方据此跳过拼接，不产生多余 token。
 */
export function buildThoughtLanguageInstruction(language: string | undefined): string {
  return normalizeThoughtLanguage(language) === "zh" ? THOUGHT_LANGUAGE_ZH_INSTRUCTION : "";
}
