import type { PermissionPrompt, WorkMode } from "../types";

const SAFE_READ_WORDS = ["read", "grep", "glob", "search", "fetch", "查看", "读取", "搜索"];
const MUTATING_WORDS = [
  "write",
  "edit",
  "delete",
  "remove",
  "bash",
  "terminal",
  "execute",
  "create",
  "修改",
  "写入",
  "删除",
  "执行",
  "创建"
];

export function isSafeReadPermission(prompt: PermissionPrompt): boolean {
  const haystack = `${prompt.toolName} ${prompt.title}`.toLowerCase();
  return SAFE_READ_WORDS.some((word) => haystack.includes(word)) &&
    !MUTATING_WORDS.some((word) => haystack.includes(word));
}
export function chooseAutomaticPermission(
  mode: WorkMode,
  prompt: PermissionPrompt,
  autoApprove = false
): string | null {
  const reject = prompt.options.find((option) => option.kind.includes("reject"));
  const allowAlways = prompt.options.find(
    (option) => option.kind === "allow_always" || (option.kind.includes("allow") && option.kind.includes("always"))
  );
  const allowOnce = prompt.options.find((option) => option.kind === "allow_once") ??
    prompt.options.find((option) => option.kind.includes("allow"));

  if (autoApprove) return allowAlways?.optionId ?? allowOnce?.optionId ?? null;

  if (mode !== "work") {
    if (isSafeReadPermission(prompt) && allowOnce) return allowOnce.optionId;
    return reject?.optionId ?? null;
  }

  return null;
}
