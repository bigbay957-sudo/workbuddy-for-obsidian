/**
 * 模型下拉框的宽度策略。
 *
 * 历史上这里用的是固定宽度（112px），好处是「加载模型列表前后尺寸一致」，
 * 代价是长模型名（Deepseek-V4.1-Flash）会被裁掉，右侧的 @ 资料 / 关联资料
 * 也无从让位。而反过来让它按最长 option 自适应，又会被模型列表里的超长名字撑爆。
 *
 * 折中方案：按「当前选中项」的实测文字宽度算，再限幅。
 */

/** 下限：与 .workbuddy-model-select-input 的 min-width 保持一致 */
export const MODEL_SELECT_MIN_WIDTH = 112;

/** 上限：再长也让一步，超出部分交给浏览器裁（配合 title 悬停看全） */
export const MODEL_SELECT_MAX_WIDTH = 240;

/**
 * 左右内边距 + 原生下拉箭头 + 边框的固定开销。
 *
 * 用无头 Chromium 实测（11px 字号、`padding: 0 6px`）为 34.4–34.7px。
 * 这里取 44px 留余量：Obsidian 的 `.dropdown` 自带背景箭头和内边距，
 * 真实开销可能比裸 select 大，宁可稍宽几 px 也不要裁字。
 */
export const MODEL_SELECT_CHROME_WIDTH = 44;

/**
 * 离屏量文字用的探针元素的类名。
 *
 * 排版相关的静态样式写在 styles.css 的 `.workbuddy-measure-probe` 里，
 * 而不是在 JS 里拼 style —— 审核 lint 不允许直接赋值 `element.style.*`。
 */
export const MEASURE_PROBE_CLASS = "workbuddy-measure-probe";

/**
 * 当前模型名实测宽度写进的 CSS 自定义属性。
 * styles.css 里 `.workbuddy-model-select-input` 用
 * `width: var(--wb-model-select-width, auto)` 消费它。
 */
export const MODEL_SELECT_WIDTH_VAR = "--wb-model-select-width";

export function computeModelSelectWidth(textWidth: number): number {
  if (!Number.isFinite(textWidth) || textWidth <= 0) return MODEL_SELECT_MIN_WIDTH;
  const wanted = Math.ceil(textWidth) + MODEL_SELECT_CHROME_WIDTH;
  return Math.min(MODEL_SELECT_MAX_WIDTH, Math.max(MODEL_SELECT_MIN_WIDTH, wanted));
}

/**
 * 量一段文字在给定字体下的渲染宽度。
 *
 * 用离屏 span 而不是 canvas `measureText`：span 走的是完全相同的排版路径，
 * 字距、连字都一致；而且 `font` 传空串或解析失败时它会继承 body 字体 ——
 * 那正是下拉框继承的同一套界面字体，所以退一步也能量准。
 *
 * 注意：这里用的是 Obsidian 注入的全局辅助函数 `createSpan`，不是
 * `document.createElement`（后者会被审核 lint 拦下）。全局函数只在函数体
 * 内被调用，模块加载期不触碰 DOM，因此 node 环境下的单测不受影响。
 */
export function measureTextWidth(label: string, font?: string): number {
  if (!label) return 0;
  const probe = createSpan({ cls: MEASURE_PROBE_CLASS, text: label });
  if (font) probe.setCssStyles({ font });
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}
