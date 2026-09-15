export type WorkMode = "search" | "ask" | "work" | "plan";

/** 思考过程（reasoning）使用的语言：zh = 强制简体中文，model = 跟随模型默认 */
export type ThoughtLanguage = "zh" | "model";

export interface QuickAction {
  name: string;
  prompt: string;
}

export interface WorkBuddySettings {
  cliPath: string;
  model: string;
  permissionMode: "default" | "acceptEdits" | "plan" | "dontAsk" | "auto" | "bypassPermissions";
  autoApprovePermissions: boolean;
  autoAttachActiveNote: boolean;
  autoAttachSelection: boolean;
  maxContextChars: number;
  updateRepository: string;
  autoCheckUpdates: boolean;
  themeColor: string;
  systemPrompt: string;
  customQuickActions: QuickAction[];
  showToolCalls: boolean;
  thoughtFontSize: number;
  bodyFontSize: number;
  bodyFontFamily: "sans" | "theme";
  thoughtLanguage: ThoughtLanguage;
  settingsVersion: number;
}

export const SETTINGS_VERSION = 4;

export const DEFAULT_SETTINGS: WorkBuddySettings = {
  cliPath: "",
  model: "",
  permissionMode: "bypassPermissions",
  autoApprovePermissions: true,
  autoAttachActiveNote: true,
  autoAttachSelection: true,
  maxContextChars: 40_000,
  updateRepository: "bigbay957-sudo/workbuddy-for-obsidian",
  autoCheckUpdates: false,
  themeColor: "#2f6fec",
  systemPrompt: "",
  customQuickActions: [],
  showToolCalls: false,
  thoughtFontSize: 11,
  bodyFontSize: 13,
  bodyFontFamily: "sans",
  thoughtLanguage: "zh",
  settingsVersion: SETTINGS_VERSION
};

export interface AttachedContext {
  path: string;
  content: string;
  selection?: string;
  kind?: "note" | "selection" | "file" | "folder" | "tag" | "heading";
  heading?: string;
}

export type RuntimeStatus = "disconnected" | "connecting" | "ready" | "working" | "error";

export interface ModelOption {
  value: string;
  name: string;
  description?: string | null;
}

export interface ConfigOptionState {
  id: string;
  name: string;
  category: string;
  currentValue: string;
  options: ModelOption[];
}

export interface PromptImage {
  data: string;
  mimeType: string;
  name?: string;
}

export type RuntimeEvent =
  | { type: "status"; status: RuntimeStatus; detail?: string }
  | { type: "agent-text"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool"; id: string; title: string; status?: string; detail?: string }
  | { type: "plan"; text: string }
  | { type: "usage"; text: string }
  | { type: "turn-stop"; reason: string }
  | { type: "config-options"; options: ConfigOptionState[] }
  | { type: "error"; message: string };

export interface PermissionChoice {
  optionId: string;
}

export interface PermissionPrompt {
  toolName: string;
  title: string;
  rawInput: unknown;
  options: Array<{ optionId: string; name: string; kind: string }>;
}
