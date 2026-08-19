import type { EditorPosition } from "obsidian";
import type { StoredContextReference } from "./context-reference";
import type { StoredSourceReference } from "./source-links";

export type StoredChatRole = "user" | "assistant";

export interface StoredSelection {
  path: string;
  text: string;
  from?: EditorPosition;
  to?: EditorPosition;
}

export interface StoredChatMessage {
  id: string;
  role: StoredChatRole;
  text: string;
  createdAt: number;
  selection?: StoredSelection;
  sources?: StoredSourceReference[];
  favorite?: boolean;
  toolActivities?: StoredToolActivity[];
}

export interface StoredToolActivity {
  id: string;
  title: string;
  status?: string;
  detail?: string;
  createdAt: number;
}

export interface ProjectContextPack {
  id: string;
  name: string;
  attachedPaths: string[];
  contextReferences: StoredContextReference[];
  createdAt: number;
  updatedAt: number;
}

export interface StoredWorkBuddyTask {
  id: string;
  title: string;
  inputDraft: string;
  attachedPaths: string[];
  contextReferences: StoredContextReference[];
  messages: StoredChatMessage[];
  updatedAt: number;
}

export interface WorkBuddyWorkspaceState {
  activeTaskId: string;
  nextTaskId: number;
  tasks: StoredWorkBuddyTask[];
  closedChats: StoredWorkBuddyTask[];
  contextPacks: ProjectContextPack[];
}

export const EMPTY_WORKSPACE_STATE: WorkBuddyWorkspaceState = {
  activeTaskId: "",
  nextTaskId: 1,
  tasks: [],
  closedChats: [],
  contextPacks: []
};

export function normalizeWorkspaceState(raw: unknown, maxOpenTasks = 5, maxClosedChats = 100): WorkBuddyWorkspaceState {
  const source = isRecord(raw) ? raw : {};
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map(normalizeTask).filter((task): task is StoredWorkBuddyTask => task !== null).slice(0, maxOpenTasks)
    : [];
  const closedChats = Array.isArray(source.closedChats)
    ? source.closedChats.map(normalizeTask).filter((task): task is StoredWorkBuddyTask => task !== null && task.messages.length > 0).slice(0, maxClosedChats)
    : [];
  const requestedActiveId = typeof source.activeTaskId === "string" ? source.activeTaskId : "";
  const activeTaskId = tasks.some((task) => task.id === requestedActiveId) ? requestedActiveId : (tasks[0]?.id ?? "");
  const inferredNextTaskId = inferNextTaskId([...tasks, ...closedChats]);
  const nextTaskId = Number.isInteger(source.nextTaskId) && Number(source.nextTaskId) > 0
    ? Math.max(Number(source.nextTaskId), inferredNextTaskId)
    : inferredNextTaskId;
  const contextPacks = Array.isArray(source.contextPacks)
    ? source.contextPacks.map(normalizeContextPack).filter((pack): pack is ProjectContextPack => pack !== null).slice(0, 50)
    : [];
  return { activeTaskId, nextTaskId, tasks, closedChats, contextPacks };
}

export function addClosedChat(closedChats: StoredWorkBuddyTask[], task: StoredWorkBuddyTask, limit = 100): StoredWorkBuddyTask[] {
  if (task.messages.length === 0) return closedChats.slice(0, limit);
  return [task, ...closedChats.filter((chat) => chat.id !== task.id)].slice(0, limit);
}

export function selectMessages(messages: StoredChatMessage[], selectedIds: ReadonlySet<string>): StoredChatMessage[] {
  return messages.filter((message) => selectedIds.has(message.id));
}

export function buildChatMarkdown(title: string, messages: StoredChatMessage[], createdAt = Date.now()): string {
  const frontmatterTitle = title.replaceAll('"', '\\"');
  const lines = [
    "---",
    `title: "${frontmatterTitle}"`,
    "source: WorkBuddy for Obsidian",
    `created: ${new Date(createdAt).toISOString()}`,
    "---",
    "",
    `# ${title}`,
    ""
  ];
  for (const message of messages) {
    lines.push(message.role === "user" ? "## 我" : "## WorkBuddy", "", message.text, "");
    if (message.selection) {
      lines.push("### 本轮引用选区", "", `来源：[[${message.selection.path}]]`, "", "> " + message.selection.text.replace(/\n/g, "\n> "), "");
    }
    if (message.sources?.length) {
      lines.push("### 参考来源", "");
      for (const source of message.sources) {
        if (source.kind === "web" && source.url) lines.push(`- [${source.label}](${source.url})`);
        else if (source.path) lines.push(`- [[${source.path}${source.heading ? `#${source.heading}` : ""}|${source.label}]]`);
      }
      lines.push("");
    }
    if (message.toolActivities?.length) {
      lines.push("### 工具操作", "");
      for (const activity of message.toolActivities) {
        lines.push(`- **${activity.title}**${activity.status ? ` · ${activity.status}` : ""}`);
        if (activity.detail) lines.push(`  - ${activity.detail.replace(/\n/g, " ")}`);
      }
      lines.push("");
    }
    if (message.favorite) lines.push("> ⭐ 已收藏的重要回答", "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function buildFullTaskMarkdown(task: StoredWorkBuddyTask, createdAt = Date.now()): string {
  const base = buildChatMarkdown(task.title, task.messages, createdAt).trimEnd();
  const references: string[] = [];
  for (const path of task.attachedPaths) references.push(`- [[${path}]]`);
  for (const reference of task.contextReferences) {
    if (reference.kind === "tag" && reference.tag) references.push(`- 标签：${reference.tag}`);
    else if (reference.kind === "folder" && reference.path) references.push(`- 文件夹：${reference.path}`);
    else if (reference.path) references.push(`- [[${reference.path}${reference.heading ? `#${reference.heading}` : ""}|${reference.label}]]`);
  }
  if (references.length === 0) return base + "\n";
  const heading = "## 任务引用资料";
  const marker = `\n# ${task.title}\n`;
  const index = base.indexOf(marker);
  if (index < 0) return `${base}\n\n${heading}\n\n${references.join("\n")}\n`;
  const insertAt = index + marker.length;
  return `${base.slice(0, insertAt)}\n${heading}\n\n${references.join("\n")}\n${base.slice(insertAt)}\n`;
}

function normalizeTask(raw: unknown): StoredWorkBuddyTask | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(normalizeMessage).filter((message): message is StoredChatMessage => message !== null)
    : [];
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 40) : "任务",
    inputDraft: typeof raw.inputDraft === "string" ? raw.inputDraft : "",
    attachedPaths: Array.isArray(raw.attachedPaths) ? raw.attachedPaths.filter((path): path is string => typeof path === "string") : [],
    contextReferences: Array.isArray(raw.contextReferences)
      ? raw.contextReferences.map(normalizeContextReference).filter((reference): reference is StoredContextReference => reference !== null)
      : [],
    messages,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now()
  };
}

function normalizeMessage(raw: unknown): StoredChatMessage | null {
  if (!isRecord(raw) || (raw.role !== "user" && raw.role !== "assistant") || typeof raw.text !== "string") return null;
  const selection = isRecord(raw.selection) && typeof raw.selection.path === "string" && typeof raw.selection.text === "string"
    ? { path: raw.selection.path, text: raw.selection.text, from: normalizePosition(raw.selection.from), to: normalizePosition(raw.selection.to) }
    : undefined;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `message-${Date.now()}-${Math.random()}`,
    role: raw.role,
    text: raw.text,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    selection,
    sources: Array.isArray(raw.sources)
      ? raw.sources.map(normalizeSource).filter((source): source is StoredSourceReference => source !== null)
      : undefined,
    favorite: raw.favorite === true,
    toolActivities: Array.isArray(raw.toolActivities)
      ? raw.toolActivities.map(normalizeToolActivity).filter((activity): activity is StoredToolActivity => activity !== null)
      : undefined
  };
}

function normalizeToolActivity(raw: unknown): StoredToolActivity | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  return {
    id: raw.id,
    title: raw.title,
    status: typeof raw.status === "string" ? raw.status : undefined,
    detail: typeof raw.detail === "string" ? raw.detail : undefined,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now()
  };
}

function normalizeContextPack(raw: unknown): ProjectContextPack | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || !raw.name.trim()) return null;
  return {
    id: raw.id,
    name: raw.name.trim().slice(0, 60),
    attachedPaths: Array.isArray(raw.attachedPaths)
      ? [...new Set(raw.attachedPaths.filter((path): path is string => typeof path === "string"))]
      : [],
    contextReferences: Array.isArray(raw.contextReferences)
      ? raw.contextReferences.map(normalizeContextReference).filter((reference): reference is StoredContextReference => reference !== null)
      : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now()
  };
}

function normalizeContextReference(raw: unknown): StoredContextReference | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.label !== "string") return null;
  if (raw.kind !== "folder" && raw.kind !== "tag" && raw.kind !== "heading") return null;
  return {
    id: raw.id,
    kind: raw.kind,
    label: raw.label,
    path: typeof raw.path === "string" ? raw.path : undefined,
    tag: typeof raw.tag === "string" ? raw.tag : undefined,
    heading: typeof raw.heading === "string" ? raw.heading : undefined,
    level: typeof raw.level === "number" ? raw.level : undefined
  };
}

function normalizeSource(raw: unknown): StoredSourceReference | null {
  if (!isRecord(raw) || (raw.kind !== "vault" && raw.kind !== "web") || typeof raw.label !== "string") return null;
  return {
    kind: raw.kind,
    label: raw.label,
    path: typeof raw.path === "string" ? raw.path : undefined,
    heading: typeof raw.heading === "string" ? raw.heading : undefined,
    line: typeof raw.line === "number" ? raw.line : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined
  };
}

function normalizePosition(raw: unknown): EditorPosition | undefined {
  if (!isRecord(raw) || !Number.isInteger(raw.line) || !Number.isInteger(raw.ch)) return undefined;
  return { line: Number(raw.line), ch: Number(raw.ch) };
}

function inferNextTaskId(tasks: StoredWorkBuddyTask[]): number {
  let maximum = 0;
  for (const task of tasks) {
    const match = /^task-(\d+)$/.exec(task.id);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum + 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
