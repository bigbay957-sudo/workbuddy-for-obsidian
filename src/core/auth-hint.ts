/**
 * CLI 认证失败与「本轮被拒绝执行」的识别与话术。
 *
 * 为什么需要这个模块：
 * ACP 的 session/prompt 在 CLI 侧拒绝执行时**不会抛异常**，而是正常返回
 * stopReason="refusal"。如果插件只监听异常，就会表现为「发出去没反应」——
 * 2026-10-27 的真实故障即如此：CLI token 过期，插件依旧提示「本轮完成」，
 * 用户完全看不出发生了什么。这里把 refusal 拆成两类，交给 UI 分别提示。
 */

export type TurnRefusalKind = "auth" | "refusal";

/** 重新登录的操作指引（错误卡片与 Notice 共用，避免两处文案漂移）。 */
export const AUTH_RECOVERY_HINT = "在终端运行 codebuddy 后输入 /login 重新登录";

/** CLI / 后端返回的认证失败特征，大小写不敏感。 */
const AUTH_PATTERNS = [
  /authentication required/i,
  /please use \/login/i,
  /\b401\b/,
  /not logged in/i,
  /invalid (?:token|credential|api[ _-]?key)/i,
  /token (?:expired|invalid)/i,
  /登录已?失效/,
  /尚未登录/,
  /未登录/
];

/** 文本里是否出现认证失败特征；空串一律返回 false。 */
export function looksLikeAuthFailure(text: string): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  return AUTH_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * 把 stopReason="refusal" 换算成用户能看懂的一句话。
 *
 * 判定顺序：
 * 1. stderr 里已经写明认证失败 → 直接判 auth；
 * 2. 本轮一个字都没吐就被拒 → 大概率是后端在入口处挡了请求（登录失效 / 额度用尽 / Key 失效），
 *    统一按 auth 处理并给出登录指引（这是实际故障里唯一有效的动作）；
 * 3. 有输出却仍被拒 → 内容/权限层面的正常拒绝。
 */
export function describeTurnRefusal(input: {
  hadOutput: boolean;
  stderrTail?: string;
}): { kind: TurnRefusalKind; message: string } {
  if (looksLikeAuthFailure(input.stderrTail ?? "")) {
    return {
      kind: "auth",
      message: `WorkBuddy CLI 登录已失效，服务器拒绝了本轮请求。请${AUTH_RECOVERY_HINT}。`
    };
  }
  if (!input.hadOutput) {
    return {
      kind: "auth",
      message:
        "本轮没有任何输出就被 WorkBuddy 拒绝执行，通常是 CLI 登录已失效（token 过期）或额度用尽。" +
        `请${AUTH_RECOVERY_HINT}后点「我已登录，重新连接」再试。`
    };
  }
  return {
    kind: "refusal",
    message: "本轮被 WorkBuddy 拒绝执行，可以补充一下任务背景或换个说法后重试。"
  };
}
