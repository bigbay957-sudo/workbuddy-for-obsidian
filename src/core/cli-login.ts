import { spawn } from "node:child_process";
import { resolveWorkBuddyExecutable } from "./workbuddy-client";

/**
 * 打开系统终端并直接运行 WorkBuddy CLI，让用户在其中执行 /login。
 *
 * 为什么不在这里直接 `spawn(cli, ["login"])`：登录是交互式 TUI（要扫码 / 跳转浏览器），
 * 插件进程没有可见终端，spawn 出去只会挂死。借用户自己的终端窗口是唯一可行路径。
 *
 * 返回 false 表示没成功拉起（未知平台 / spawn 报错），调用方应退回手写命令提示。
 */
export function openLoginTerminal(configuredPath: string): boolean {
  const executable = resolveWorkBuddyExecutable(configuredPath) ?? "codebuddy";
  try {
    if (process.platform === "darwin") {
      const script = [
        'tell application "Terminal"',
        "activate",
        `do script "${escapeAppleScript(executable)}"`,
        "end tell"
      ].join("\n");
      const child = spawn("/usr/bin/osascript", ["-e", script], { stdio: "ignore", detached: true });
      child.on("error", () => undefined);
      child.unref();
      return true;
    }
    if (process.platform === "win32") {
      // start 的第一个空参数是窗口标题占位，避免路径被当成标题
      const child = spawn("cmd", ["/c", "start", "", "cmd", "/k", executable], {
        stdio: "ignore",
        detached: true,
        windowsHide: true
      });
      child.on("error", () => undefined);
      child.unref();
      return true;
    }
    const child = spawn("x-terminal-emulator", ["-e", executable], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** AppleScript 字符串字面量里只需转义反斜杠与双引号。 */
function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
