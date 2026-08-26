import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as acp from "@agentclientprotocol/sdk";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import type {
  ClientConnection,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionId
} from "@agentclientprotocol/sdk";
import { normalizeSessionUpdate } from "./event-normalizer";
import { chooseAutomaticPermission } from "./permissions";
import type {
  ConfigOptionState,
  ModelOption,
  PermissionChoice,
  PermissionPrompt,
  PromptImage,
  RuntimeEvent,
  WorkBuddySettings,
  WorkMode
} from "../types";

const PLUGIN_VERSION = "0.8.5";

type SettingsProvider = () => WorkBuddySettings;
type PermissionHandler = (prompt: PermissionPrompt) => Promise<PermissionChoice | null>;

export class WorkBuddyClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: ClientConnection | null = null;
  private sessionId: SessionId | null = null;
  private listeners = new Set<(event: RuntimeEvent) => void>();
  private permissionHandler: PermissionHandler | null = null;
  private mode: WorkMode = "ask";
  private stderrTail = "";
  private prompting = false;

  constructor(
    private readonly getSettings: SettingsProvider,
    private readonly cwd: string
  ) {}

  onEvent(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPermissionHandler(handler: PermissionHandler | null): void {
    this.permissionHandler = handler;
  }

  setMode(mode: WorkMode): void {
    this.mode = mode;
  }

  async connect(): Promise<void> {
    if (this.connection && !this.connection.signal.aborted) return;
    this.emit({ type: "status", status: "connecting", detail: "正在启动 WorkBuddy…" });

    const settings = this.getSettings();
    const executable = resolveWorkBuddyExecutable(settings.cliPath);
    if (!executable) {
      throw new Error("未找到 codebuddy。请在插件设置中填写 CLI 路径，或先执行 npm install -g @tencent-ai/codebuddy-code。 ");
    }

    const args = ["--acp", "--permission-mode", settings.permissionMode];
    if (settings.model.trim()) args.push("--model", settings.model.trim());

    this.child = spawn(executable, args, {
      cwd: this.cwd,
      env: withLocalBinOnPath(process.env),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4_000);
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      if (this.connection?.signal.aborted) return;
      this.connection = null;
      this.sessionId = null;
      this.emit({
        type: "status",
        status: "disconnected",
        detail: `WorkBuddy 已退出（${signal ?? code ?? "unknown"}）`
      });
    });

    const output = Writable.toWeb(this.child.stdin) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(this.child.stdout) as ReadableStream<Uint8Array>;
    const app = acp
      .client({ name: "workbuddy-for-obsidian" })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) =>
        this.handlePermission(ctx.params)
      )
      .onNotification(acp.methods.client.session.update, (ctx) => {
        const event = normalizeSessionUpdate(ctx.params);
        if (!event) return;
        // 过滤 CLI 启动期间的 banner 文本：仅在 prompt 轮次内接受 agent 文本输出
        if (event.type === "agent-text" && !this.prompting) return;
        this.emit(event);
      });

    this.connection = app.connect(acp.ndJsonStream(output, input));
    this.connection.closed.catch((error) => this.fail(error));

    try {
      await this.connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          plan: {}
        },
        clientInfo: { name: "WorkBuddy for Obsidian", version: PLUGIN_VERSION }
      });
      await this.createSession();
      this.emit({ type: "status", status: "ready", detail: "WorkBuddy 已连接" });
    } catch (error) {
      this.cleanupProcess();
      this.fail(error);
      throw error;
    }
  }

  async newSession(): Promise<void> {
    if (!this.connection) {
      await this.connect();
      return;
    }
    await this.createSession();
    this.emit({ type: "status", status: "ready", detail: "已新建会话" });
  }

  private async createSession(): Promise<void> {
    const result = await this.connection!.agent.request(acp.methods.agent.session.new, {
      cwd: this.cwd,
      mcpServers: []
    });
    this.sessionId = result.sessionId;
    this.emit({ type: "config-options", options: extractConfigOptions(result.configOptions) });
  }

  async prompt(text: string, images: PromptImage[] = []): Promise<void> {
    await this.connect();
    if (!this.sessionId) await this.newSession();
    this.prompting = true;
    this.emit({ type: "status", status: "working", detail: "WorkBuddy 正在工作" });
    try {
      const blocks: ContentBlock[] = [];
    if (text.trim()) blocks.push({ type: "text", text });
    for (const image of images) {
      blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
    }
    const promptBlocks: ContentBlock[] = blocks.length ? blocks : [{ type: "text", text: "" }];
      const result = await this.connection!.agent.request(acp.methods.agent.session.prompt, {
        sessionId: this.sessionId!,
        prompt: promptBlocks
      });
      this.emit({ type: "turn-stop", reason: result.stopReason });
      this.emit({ type: "status", status: "ready", detail: "本轮完成" });
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.prompting = false;
    }
  }

  async setConfigOption(configId: string, value: string, silent = false): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    try {
      const result = await this.connection.agent.request(
        acp.methods.agent.session.setConfigOption,
        {
          sessionId: this.sessionId,
          configId,
          value
        }
      );
      this.emit({ type: "config-options", options: extractConfigOptions(result.configOptions) });
    } catch (error) {
      // silent 模式用于默认值对齐（如默认切到 auto），失败不弹错误，避免打断会话
      if (!silent) this.fail(error);
    }
  }

  async cancel(): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    await this.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: this.sessionId
    });
    this.emit({ type: "status", status: "ready", detail: "已请求停止" });
  }

  disconnect(): void {
    this.cleanupProcess();
    this.emit({ type: "status", status: "disconnected", detail: "已断开" });
  }

  private async handlePermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const meta = params.toolCall._meta as Record<string, unknown> | null | undefined;
    const prompt: PermissionPrompt = {
      toolName: String(meta?.["codebuddy.ai/toolName"] ?? params.toolCall.name ?? "tool"),
      title: params.toolCall.title ?? "工具操作",
      rawInput: params.toolCall.rawInput,
      options: params.options.map((option) => ({
        optionId: option.optionId,
        name: option.name,
        kind: option.kind
      }))
    };

    const automatic = chooseAutomaticPermission(this.mode, prompt);
    if (automatic) return { outcome: { outcome: "selected", optionId: automatic } };
    if (!this.permissionHandler) return { outcome: { outcome: "cancelled" } };

    const choice = await this.permissionHandler(prompt);
    return choice
      ? { outcome: { outcome: "selected", optionId: choice.optionId } }
      : { outcome: { outcome: "cancelled" } };
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private fail(error: unknown): void {
    const raw = error instanceof Error ? error.message : String(error);
    const base = /authentication required/i.test(raw)
      ? "WorkBuddy CLI 尚未登录。请先在终端运行 codebuddy，完成登录后重新打开侧边栏。"
      : raw;
    const stderrHint = this.stderrTail.trim() ? "；请检查 WorkBuddy 登录状态或插件设置" : "";
    this.emit({ type: "error", message: `${base}${stderrHint}` });
    this.emit({ type: "status", status: "error", detail: "连接或执行失败" });
  }

  private cleanupProcess(): void {
    this.connection?.close();
    this.connection = null;
    this.sessionId = null;
    if (this.child && !this.child.killed) this.child.kill("SIGTERM");
    this.child = null;
  }
}

export function resolveWorkBuddyExecutable(configuredPath: string): string | null {
  const candidates = [
    configuredPath.trim(),
    join(homedir(), ".local", "bin", "codebuddy"),
    "/opt/homebrew/bin/codebuddy",
    "/usr/local/bin/codebuddy",
    "codebuddy",
    "cbc"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate.includes("/")) return candidate;
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function withLocalBinOnPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const paths = [join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  return { ...env, PATH: `${paths.join(":")}:${env.PATH ?? ""}` };
}

/**
 * 把 ACP 的 SessionConfigOption[] 折叠成前端可用的 ConfigOptionState[]。
 * 只保留 select 类型（含模型选择），options 可能是平铺选项或分组，统一扁平化。
 */
function extractConfigOptions(raw: unknown): ConfigOptionState[] {
  if (!Array.isArray(raw)) return [];
  const result: ConfigOptionState[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const opt = entry as Record<string, unknown>;
    if (opt.type !== "select") continue;
    if (typeof opt.id !== "string" || typeof opt.currentValue !== "string") continue;
    result.push({
      id: opt.id,
      name: typeof opt.name === "string" ? opt.name : opt.id,
      category: typeof opt.category === "string" ? opt.category : "",
      currentValue: opt.currentValue,
      options: flattenSelectOptions(opt.options)
    });
  }
  return result;
}

function flattenSelectOptions(raw: unknown): ModelOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ModelOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.value === "string" && typeof e.name === "string") {
      out.push({ value: e.value, name: e.name, description: typeof e.description === "string" ? e.description : null });
    } else if (Array.isArray(e.options)) {
      for (const sub of e.options) {
        if (sub && typeof sub === "object") {
          const s = sub as Record<string, unknown>;
          if (typeof s.value === "string" && typeof s.name === "string") {
            out.push({ value: s.value, name: s.name, description: typeof s.description === "string" ? s.description : null });
          }
        }
      }
    }
  }
  return out;
}
