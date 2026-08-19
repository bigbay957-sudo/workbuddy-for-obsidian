import {
  ItemView,
  Menu,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  TFile,
  getAllTags,
  normalizePath,
  setIcon,
  type EditorPosition,
  type WorkspaceLeaf
} from "obsidian";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type WorkBuddyPlugin from "../main";
import {
  addClosedChat,
  buildChatMarkdown,
  buildFullTaskMarkdown,
  selectMessages,
  type ProjectContextPack,
  type StoredChatMessage,
  type StoredSelection,
  type StoredToolActivity,
  type StoredWorkBuddyTask,
  type WorkBuddyWorkspaceState
} from "../core/chat-persistence";
import {
  contextReferenceKey,
  extractHeadingSection,
  isReadableTextExtension,
  type StoredContextReference
} from "../core/context-reference";
import { WORKBUDDY_ICON_ID } from "../core/workbuddy-icon";
import { buildUniqueUploadPath, canUploadLocalFile } from "../core/local-upload";
import { recommendRelatedNotes, type NoteSignals } from "../core/related-notes";
import { MAX_WORKBUDDY_TASKS, canAddWorkBuddyTask } from "../core/task-pages";
import { buildWorkBuddyPrompt } from "../core/prompt-builder";
import {
  dedupeSources,
  extractSourceReferences,
  type StoredSourceReference
} from "../core/source-links";
import type { WorkBuddyClient } from "../core/workbuddy-client";
import { filterWorkTemplates, type WorkTemplate } from "../core/work-templates";
import type { AttachedContext, RuntimeEvent, RuntimeStatus, WorkMode } from "../types";
import { ContextSuggestModal, type ContextSuggestItem } from "./context-suggest-modal";
import { ContextPackModal, RelatedNotesModal } from "./context-management-modals";
import { PermissionModal } from "./permission-modal";
import {
  ChatHistoryModal,
  ConfirmTaskCloseModal,
  DiffPreviewModal,
  SaveChatModal,
  TaskNameModal
} from "./task-modals";

export const WORKBUDDY_VIEW_TYPE = "workbuddy-for-obsidian-chat";

interface SelectionSnapshot extends StoredSelection {
  view?: MarkdownView;
}

interface WorkBuddyTask {
  id: string;
  title: string;
  runtime: WorkBuddyClient;
  status: RuntimeStatus;
  statusDetail: string;
  messagesEl: HTMLElement;
  inputDraft: string;
  messages: StoredChatMessage[];
  attachedFiles: Map<string, TFile>;
  contextReferences: Map<string, StoredContextReference>;
  toolEls: Map<string, HTMLElement>;
  selectionSnapshot: SelectionSnapshot | null;
  currentTurnSelection: SelectionSnapshot | null;
  currentAssistantBody: HTMLElement | null;
  currentAssistantText: string;
  currentTurnSources: StoredSourceReference[];
  currentTurnTools: Map<string, StoredToolActivity>;
  needsHistoryContext: boolean;
  unsubscribeRuntime: () => void;
}

interface UndoEdit {
  path: string;
  from: EditorPosition;
  toAfter: EditorPosition;
  original: string;
  replacement: string;
}

export class WorkBuddyChatView extends ItemView {
  private readonly mode: WorkMode = "work";
  private tasks: WorkBuddyTask[] = [];
  private activeTaskId = "";
  private nextTaskId = 1;
  private messagesHostEl!: HTMLElement;
  private taskTabsEl!: HTMLElement;
  private addTaskButton!: HTMLButtonElement;
  private closeTaskButton!: HTMLButtonElement;
  private inputEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private contextEl!: HTMLElement;
  private undoButton!: HTMLButtonElement;
  private relatedButton!: HTMLButtonElement;
  private slashMenuEl!: HTMLElement;
  private lastMarkdownView: MarkdownView | null = null;
  private closedChats: StoredWorkBuddyTask[] = [];
  private contextPacks: ProjectContextPack[] = [];
  private lastEdit: UndoEdit | null = null;
  private persistTimer: number | null = null;
  private messageSequence = 1;
  private selectionCaptureTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: WorkBuddyPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return WORKBUDDY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "WorkBuddy";
  }

  getIcon(): string {
    return WORKBUDDY_ICON_ID;
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("workbuddy-view");

    this.renderHeader(container);
    this.renderTaskBar(container);
    this.messagesHostEl = container.createDiv({ cls: "workbuddy-messages-host" });
    this.renderComposer(container);
    const saved = this.plugin.getWorkspaceState();
    this.nextTaskId = saved.nextTaskId;
    this.closedChats = saved.closedChats;
    this.contextPacks = saved.contextPacks;
    for (const storedTask of saved.tasks) await this.addTask(false, storedTask);
    if (this.tasks.length === 0) await this.addTask(false);
    else this.switchTask(saved.activeTaskId || this.tasks[0]!.id);

    const onSelectionChange = (): void => {
      if (this.selectionCaptureTimer !== null) window.clearTimeout(this.selectionCaptureTimer);
      this.selectionCaptureTimer = window.setTimeout(() => {
        this.selectionCaptureTimer = null;
        this.captureSelection();
      }, 30);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    this.register(() => document.removeEventListener("selectionchange", onSelectionChange));
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
        this.captureSelection();
        this.refreshRelatedCount();
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path === this.getSourceView()?.file?.path) this.refreshRelatedCount();
      })
    );
    this.captureSelection();
    this.refreshRelatedCount();
  }

  async onClose(): Promise<void> {
    if (this.selectionCaptureTimer !== null) window.clearTimeout(this.selectionCaptureTimer);
    if (this.persistTimer !== null) window.clearTimeout(this.persistTimer);
    await this.persistWorkspace();
    for (const task of this.tasks) {
      task.unsubscribeRuntime();
      task.runtime.setPermissionHandler(null);
      task.runtime.disconnect();
    }
    this.tasks = [];
  }

  public async addTask(showNotice = true, storedTask?: StoredWorkBuddyTask): Promise<void> {
    if (!canAddWorkBuddyTask(this.tasks.length)) {
      new Notice("最多只能同时打开 " + MAX_WORKBUDDY_TASKS + " 个 WorkBuddy 任务");
      return;
    }

    const runtime = this.plugin.createRuntime();
    runtime.setMode(this.mode);
    runtime.setPermissionHandler((prompt) =>
      new Promise((resolve) => new PermissionModal(this.app, prompt, resolve).open())
    );

    const taskId = storedTask?.id ?? "task-" + this.nextTaskId++;
    const messagesEl = this.messagesHostEl.createDiv({ cls: "workbuddy-messages" });
    const attachedFiles = new Map<string, TFile>();
    for (const path of storedTask?.attachedPaths ?? []) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) attachedFiles.set(file.path, file);
    }
    const task: WorkBuddyTask = {
      id: taskId,
      title: storedTask?.title ?? String(this.tasks.length + 1),
      runtime,
      status: "disconnected",
      statusDetail: "尚未连接",
      messagesEl,
      inputDraft: storedTask?.inputDraft ?? "",
      messages: storedTask?.messages.map(cloneMessage) ?? [],
      attachedFiles,
      contextReferences: new Map((storedTask?.contextReferences ?? []).map((reference) => [contextReferenceKey(reference), { ...reference }])),
      toolEls: new Map(),
      selectionSnapshot: null,
      currentTurnSelection: null,
      currentAssistantBody: null,
      currentAssistantText: "",
      currentTurnSources: [],
      currentTurnTools: new Map(),
      needsHistoryContext: Boolean(storedTask?.messages.length),
      unsubscribeRuntime: () => undefined
    };
    task.unsubscribeRuntime = runtime.onEvent((event) => void this.handleRuntimeEvent(task, event));
    this.tasks.push(task);
    if (task.messages.length > 0) await this.renderStoredMessages(task);
    else this.renderWelcome(task);
    this.switchTask(task.id);

    if (showNotice) new Notice("已新增任务 " + task.title);
    this.schedulePersist();
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "workbuddy-header" });
    const brand = header.createDiv({ cls: "workbuddy-brand" });
    const icon = brand.createSpan({ cls: "workbuddy-brand-icon" });
    setIcon(icon, WORKBUDDY_ICON_ID);
    brand.createSpan({ text: "WorkBuddy", cls: "workbuddy-brand-title" });
    this.statusEl = header.createDiv({ cls: "workbuddy-status" });

    const settings = header.createEl("button", {
      cls: "clickable-icon workbuddy-icon-button",
      attr: { "aria-label": "打开设置" }
    });
    setIcon(settings, "settings");
    settings.addEventListener("click", () => {
      const appWithSettings = this.app as typeof this.app & { setting?: { open(): void; openTabById(id: string): void } };
      appWithSettings.setting?.open();
      appWithSettings.setting?.openTabById(this.plugin.manifest.id);
    });
  }

  private renderTaskBar(container: HTMLElement): void {
    const taskBar = container.createDiv({ cls: "workbuddy-task-bar" });
    this.taskTabsEl = taskBar.createDiv({ cls: "workbuddy-task-tabs" });
    this.addTaskButton = taskBar.createEl("button", {
      cls: "clickable-icon workbuddy-add-task",
      attr: { "aria-label": "新增 WorkBuddy 任务", title: "新增 WorkBuddy 任务" }
    });
    setIcon(this.addTaskButton, "square-plus");
    this.addTaskButton.addEventListener("click", () => void this.addTask());
  }

  private renderTaskTabs(): void {
    if (!this.taskTabsEl) return;
    this.taskTabsEl.empty();
    for (const task of this.tasks) {
      const tab = this.taskTabsEl.createDiv({ cls: "workbuddy-task-tab" });
      tab.toggleClass("is-active", task.id === this.activeTaskId);
      tab.toggleClass("is-working", task.status === "working" || task.status === "connecting");
      tab.toggleClass("is-error", task.status === "error");
      const button = tab.createEl("button", {
        text: task.title,
        cls: "workbuddy-task-tab-label",
        attr: {
          "aria-label": "切换到 WorkBuddy 任务 " + task.title,
          title: task.title + (task.status === "working" ? " · 正在工作" : "")
        }
      });
      button.addEventListener("click", () => this.switchTask(task.id));
      button.addEventListener("dblclick", () => this.renameTask(task));
      tab.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const menu = new Menu();
        menu.addItem((item) => item.setTitle("重命名任务").setIcon("pencil").onClick(() => this.renameTask(task)));
        menu.addItem((item) => item.setTitle("保存聊天记录").setIcon("save").onClick(() => {
          this.switchTask(task.id);
          this.openSaveChat();
        }));
        menu.addItem((item) => item.setTitle("任务历史").setIcon("history").onClick(() => this.openHistory()));
        menu.addSeparator();
        menu.addItem((item) => item.setTitle("关闭任务").setIcon("x").onClick(() => this.requestCloseTask(task)));
        menu.showAtMouseEvent(event);
      });
    }

    const atLimit = !canAddWorkBuddyTask(this.tasks.length);
    this.addTaskButton.disabled = atLimit;
    this.addTaskButton.setAttribute(
      "title",
      atLimit ? "已达到 " + MAX_WORKBUDDY_TASKS + " 个任务上限" : "新增 WorkBuddy 任务"
    );
  }

  private switchTask(taskId: string): void {
    const current = this.getActiveTask();
    if (current && this.inputEl) current.inputDraft = this.inputEl.value;

    const next = this.tasks.find((task) => task.id === taskId);
    if (!next) return;
    this.activeTaskId = next.id;
    for (const task of this.tasks) task.messagesEl.hidden = task.id !== next.id;
    if (this.inputEl) this.inputEl.value = next.inputDraft;
    this.refreshSlashMenu();
    this.renderTaskTabs();
    this.refreshContextPills();
    this.refreshActiveStatus();
    this.scrollToBottom(next);
    this.schedulePersist();
  }

  private renderComposer(container: HTMLElement): void {
    const composer = container.createDiv({ cls: "workbuddy-composer" });
    const contextRow = composer.createDiv({ cls: "workbuddy-composer-context-row" });
    this.contextEl = contextRow.createDiv({ cls: "workbuddy-context" });
    const taskActions = contextRow.createDiv({ cls: "workbuddy-composer-task-actions" });
    this.closeTaskButton = taskActions.createEl("button", {
      cls: "clickable-icon workbuddy-task-action",
      attr: { "aria-label": "关闭当前任务", title: "关闭当前任务" }
    });
    setIcon(this.closeTaskButton, "x");
    this.closeTaskButton.addEventListener("click", () => {
      const task = this.getActiveTask();
      if (task) this.requestCloseTask(task);
    });

    this.slashMenuEl = composer.createDiv({ cls: "workbuddy-slash-menu" });
    this.slashMenuEl.hidden = true;

    this.inputEl = composer.createEl("textarea", {
      cls: "workbuddy-input",
      attr: { placeholder: "描述要让 WorkBuddy 完成的工作…", rows: "3" }
    });
    this.inputEl.addEventListener("input", () => {
      const task = this.getActiveTask();
      if (task) task.inputDraft = this.inputEl.value;
      if (/(^|\s)@$/.test(this.inputEl.value)) {
        this.inputEl.value = this.inputEl.value.slice(0, -1);
        if (task) task.inputDraft = this.inputEl.value;
        this.openContextPicker();
      }
      this.refreshSlashMenu();
      this.schedulePersist();
    });
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.slashMenuEl.hidden) {
        event.preventDefault();
        this.slashMenuEl.hidden = true;
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        if (!this.slashMenuEl.hidden) {
          const first = this.slashMenuEl.querySelector<HTMLButtonElement>("button");
          if (first) {
            event.preventDefault();
            first.click();
            return;
          }
        }
        event.preventDefault();
        void this.send();
      }
    });

    const toolbar = composer.createDiv({ cls: "workbuddy-composer-toolbar" });
    const attach = toolbar.createEl("button", { text: "@ 添加资料", cls: "workbuddy-secondary-button" });
    attach.addEventListener("click", () => this.openContextPicker());

    const packs = toolbar.createEl("button", { text: "资料包", cls: "workbuddy-secondary-button" });
    packs.addEventListener("click", () => this.openContextPacks());

    this.relatedButton = toolbar.createEl("button", { text: "关联资料", cls: "workbuddy-secondary-button" });
    this.relatedButton.addEventListener("click", () => this.openRelatedNotes());

    this.undoButton = toolbar.createEl("button", {
      text: "撤销修改",
      cls: "workbuddy-secondary-button",
      attr: { title: "撤销最近一次由 WorkBuddy 插入或替换的内容" }
    });
    this.undoButton.disabled = true;
    this.undoButton.addEventListener("click", () => this.undoLastEdit());

    const actions = toolbar.createDiv({ cls: "workbuddy-send-actions" });
    this.stopButton = actions.createEl("button", { text: "停止", cls: "workbuddy-stop-button" });
    this.stopButton.hidden = true;
    this.stopButton.addEventListener("click", () => void this.getActiveTask()?.runtime.cancel());
    this.sendButton = actions.createEl("button", { text: "发送", cls: "mod-cta workbuddy-send-button" });
    this.sendButton.addEventListener("click", () => void this.send());
  }

  private openContextPicker(): void {
    new ContextSuggestModal(this.app, (item) => this.addContextItem(item)).open();
  }

  private addContextItem(item: ContextSuggestItem): void {
    const task = this.getActiveTask();
    if (!task) return;
    if (item.kind === "upload") {
      void this.uploadLocalFiles(task);
      return;
    }
    if (item.kind === "file") {
      task.attachedFiles.set(item.file.path, item.file);
    } else {
      const reference: StoredContextReference = item.kind === "folder"
        ? { id: `folder:${item.path}`, kind: "folder", label: item.label, path: item.path }
        : item.kind === "tag"
          ? { id: `tag:${item.tag}`, kind: "tag", label: item.label, tag: item.tag }
          : {
              id: `heading:${item.file.path}#${item.heading}`,
              kind: "heading",
              label: item.label,
              path: item.file.path,
              heading: item.heading,
              level: item.level
            };
      task.contextReferences.set(reference.id, reference);
    }
    this.refreshContextPills();
    this.inputEl.focus();
    this.schedulePersist();
  }

  private async uploadLocalFiles(task: WorkBuddyTask): Promise<void> {
    const dialog = getElectronDialog();
    if (!dialog) {
      new Notice("当前 Obsidian 环境无法打开系统文件选择器");
      return;
    }
    try {
      const result = await dialog.showOpenDialog({
        title: "选择要添加到 WorkBuddy 的本地文件",
        buttonLabel: "添加资料",
        properties: ["openFile", "multiSelections"]
      });
      if (result.canceled || result.filePaths.length === 0) return;
      await this.ensureFolder("WorkBuddy");
      await this.ensureFolder("WorkBuddy/Uploads");
      let imported = 0;
      const skipped: string[] = [];
      for (const sourcePath of result.filePaths) {
        try {
          const contents = await readFile(sourcePath);
          if (!canUploadLocalFile(contents.byteLength)) {
            skipped.push(`${basename(sourcePath)}（超过 200MB）`);
            continue;
          }
          const vaultPath = buildUniqueUploadPath(
            basename(sourcePath),
            (path) => Boolean(this.app.vault.getAbstractFileByPath(path))
          );
          const file = await this.app.vault.createBinary(vaultPath, Uint8Array.from(contents).buffer);
          task.attachedFiles.set(file.path, file);
          imported++;
        } catch (error) {
          skipped.push(`${basename(sourcePath)}（${readError(error)}）`);
        }
      }
      this.refreshContextPills();
      this.schedulePersist();
      if (imported > 0) new Notice(`已上传并引用 ${imported} 个本地文件`);
      if (skipped.length > 0) new Notice(`以下文件未上传：${skipped.join("、")}`, 10_000);
    } catch (error) {
      new Notice("上传本地文件失败：" + readError(error), 8_000);
    }
  }

  private openContextPacks(): void {
    const task = this.getActiveTask();
    if (!task) return;
    new ContextPackModal(
      this.app,
      this.contextPacks,
      task.attachedFiles.size + task.contextReferences.size,
      (name) => this.saveCurrentContextPack(task, name),
      (pack) => this.applyContextPack(task, pack),
      (pack) => this.deleteContextPack(pack)
    ).open();
  }

  private saveCurrentContextPack(task: WorkBuddyTask, name: string): void {
    const now = Date.now();
    const existing = this.contextPacks.find((pack) => pack.name.toLowerCase() === name.toLowerCase());
    const pack: ProjectContextPack = {
      id: existing?.id ?? `pack-${now}`,
      name,
      attachedPaths: [...task.attachedFiles.keys()],
      contextReferences: [...task.contextReferences.values()].map((reference) => ({ ...reference })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.contextPacks = [pack, ...this.contextPacks.filter((item) => item.id !== pack.id)].slice(0, 50);
    this.schedulePersist();
    new Notice(existing ? `已更新资料包：“${name}”` : `已保存资料包：“${name}”`);
  }

  private applyContextPack(task: WorkBuddyTask, pack: ProjectContextPack): void {
    let added = 0;
    for (const path of pack.attachedPaths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || task.attachedFiles.has(path)) continue;
      task.attachedFiles.set(path, file);
      added++;
    }
    for (const reference of pack.contextReferences) {
      if (task.contextReferences.has(reference.id)) continue;
      task.contextReferences.set(reference.id, { ...reference });
      added++;
    }
    this.refreshContextPills();
    this.schedulePersist();
    new Notice(`已应用“${pack.name}”，新增 ${added} 项资料`);
  }

  private deleteContextPack(pack: ProjectContextPack): void {
    this.contextPacks = this.contextPacks.filter((item) => item.id !== pack.id);
    this.schedulePersist();
    new Notice(`已删除资料包：“${pack.name}”`);
  }

  private openRelatedNotes(): void {
    const source = this.getSourceView()?.file ?? this.app.workspace.getActiveFile();
    if (!source || source.extension !== "md") {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    const all = this.app.vault.getMarkdownFiles().map((file) => this.buildNoteSignals(file));
    const current = all.find((item) => item.path === source.path);
    if (!current) return;
    new RelatedNotesModal(
      this.app,
      source.path,
      recommendRelatedNotes(current, all, 8),
      (path) => this.attachRelatedNote(path),
      (path) => void this.openVaultPath(path)
    ).open();
  }

  private refreshRelatedCount(): void {
    if (!this.relatedButton) return;
    const source = this.getSourceView()?.file ?? this.app.workspace.getActiveFile();
    if (!source || source.extension !== "md") {
      this.relatedButton.setText("关联资料");
      this.relatedButton.disabled = true;
      return;
    }
    const all = this.app.vault.getMarkdownFiles().map((file) => this.buildNoteSignals(file));
    const current = all.find((item) => item.path === source.path);
    const count = current ? recommendRelatedNotes(current, all, 8).length : 0;
    this.relatedButton.setText(count ? `关联资料 ${count}` : "关联资料");
    this.relatedButton.disabled = false;
    this.relatedButton.title = count ? `发现 ${count} 篇本地关联笔记` : "查看当前笔记的关联资料";
  }

  private buildNoteSignals(file: TFile): NoteSignals {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = [...(cache?.links ?? []), ...(cache?.embeds ?? [])]
      .map((link) => this.app.metadataCache.getFirstLinkpathDest(link.link, file.path)?.path)
      .filter((path): path is string => Boolean(path));
    return {
      path: file.path,
      title: file.basename,
      tags: getAllTags(cache ?? {}) ?? [],
      headings: cache?.headings?.map((heading) => heading.heading) ?? [],
      links
    };
  }

  private attachRelatedNote(path: string): void {
    const task = this.getActiveTask();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!task || !(file instanceof TFile)) return;
    task.attachedFiles.set(path, file);
    this.refreshContextPills();
    this.schedulePersist();
    new Notice(`已添加关联资料：${path}`);
  }

  private async openVaultPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
  }

  private refreshSlashMenu(): void {
    if (!this.slashMenuEl) return;
    const value = this.inputEl.value.trimStart();
    if (!value.startsWith("/") || value.includes("\n")) {
      this.slashMenuEl.hidden = true;
      return;
    }
    const templates = filterWorkTemplates(value);
    this.slashMenuEl.empty();
    if (templates.length === 0) {
      this.slashMenuEl.hidden = true;
      return;
    }
    for (const template of templates) {
      const button = this.slashMenuEl.createEl("button", { cls: "workbuddy-slash-item" });
      const main = button.createDiv();
      main.createSpan({ text: "/" + template.name, cls: "workbuddy-slash-name" });
      main.createSpan({ text: template.description, cls: "workbuddy-slash-description" });
      button.addEventListener("click", () => this.applyWorkTemplate(template));
    }
    this.slashMenuEl.hidden = false;
  }

  private applyWorkTemplate(template: WorkTemplate): void {
    const task = this.getActiveTask();
    this.inputEl.value = template.prompt;
    if (task) task.inputDraft = template.prompt;
    this.slashMenuEl.hidden = true;
    this.inputEl.focus();
    this.schedulePersist();
  }

  private renderWelcome(task: WorkBuddyTask): void {
    const welcome = task.messagesEl.createDiv({ cls: "workbuddy-welcome" });
    const icon = welcome.createDiv({ cls: "workbuddy-welcome-icon" });
    setIcon(icon, WORKBUDDY_ICON_ID);
    welcome.createEl("h3", { text: "WorkBuddy 任务 " + task.title });
    welcome.createEl("p", { text: "选中笔记内容并描述任务；首次发送时才会连接 WorkBuddy。" });
  }

  private async send(): Promise<void> {
    const task = this.getActiveTask();
    const input = this.inputEl.value.trim();
    if (!task || !input || task.status === "working" || task.status === "connecting") return;

    this.captureSelection();
    this.appendUserMessage(task, input);
    this.inputEl.value = "";
    task.inputDraft = "";
    const contexts = await this.collectContexts(task);
    task.currentTurnSources = dedupeSources(contexts.map((context) => ({
      kind: "vault" as const,
      label: context.heading ? `${context.path}#${context.heading}` : context.path,
      path: context.path,
      heading: context.heading
    }))).slice(0, 20);
    task.currentTurnSelection = task.selectionSnapshot ? { ...task.selectionSnapshot } : null;
    let prompt = buildWorkBuddyPrompt(input, this.mode, contexts, this.plugin.settings.maxContextChars);
    if (task.needsHistoryContext) {
      const history = buildHistoryContext(task.messages.slice(0, -1));
      if (history) prompt += "\n\n以下是这个恢复任务的历史对话，请延续上下文：\n" + history;
      task.needsHistoryContext = false;
    }
    task.currentAssistantText = "";
    task.currentTurnTools.clear();
    task.currentAssistantBody = this.appendAssistantMessage(task);
    task.runtime.setMode(this.mode);

    try {
      await task.runtime.prompt(prompt);
    } catch (error) {
      new Notice("WorkBuddy 执行失败：" + readError(error), 8_000);
    }
  }

  private async collectContexts(task: WorkBuddyTask): Promise<AttachedContext[]> {
    const result: AttachedContext[] = [];
    const seen = new Set<string>();
    let remaining = Math.max(1_000, this.plugin.settings.maxContextChars);
    const append = (context: AttachedContext): boolean => {
      const key = context.kind === "selection"
        ? `selection:${context.path}`
        : `source:${context.path}#${context.heading ?? ""}`;
      if (seen.has(key)) return remaining > 0;
      if (remaining <= 0) return false;
      seen.add(key);
      const content = context.content.slice(0, remaining);
      result.push({
        ...context,
        content,
        selection: context.selection?.slice(0, remaining)
      });
      remaining -= content.length;
      return remaining > 0;
    };
    const sourceView = this.getSourceView();
    const selected = this.plugin.settings.autoAttachSelection ? task.selectionSnapshot : null;

    if (selected) {
      append({
        path: selected.path,
        content: selected.text,
        selection: selected.text,
        kind: "selection"
      });
    }
    for (const file of task.attachedFiles.values()) {
      if (remaining <= 0) break;
      if (isReadableTextExtension(file.extension)) {
        append({ path: file.path, content: await this.app.vault.cachedRead(file), kind: file.extension === "md" ? "note" : "file" });
      } else {
        append({
          path: file.path,
          content: `用户附加了文件“${file.path}”。请在需要时使用 WorkBuddy 文件工具读取和分析这个路径。`,
          kind: "file"
        });
      }
    }
    for (const reference of task.contextReferences.values()) {
      if (reference.kind === "heading" && reference.path && reference.heading) {
        const file = this.app.vault.getAbstractFileByPath(reference.path);
        if (!(file instanceof TFile)) continue;
        const content = extractHeadingSection(await this.app.vault.cachedRead(file), reference.heading, reference.level);
        append({ path: file.path, content: content || `未找到标题：${reference.heading}`, kind: "heading", heading: reference.heading });
        continue;
      }
      if (reference.kind === "folder" && reference.path) {
        const prefix = reference.path.endsWith("/") ? reference.path : reference.path + "/";
        for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => candidate.path.startsWith(prefix)).slice(0, 50)) {
          if (remaining <= 0) break;
          append({ path: file.path, content: await this.app.vault.cachedRead(file), kind: "folder" });
        }
        continue;
      }
      if (reference.kind === "tag" && reference.tag) {
        for (const file of this.app.vault.getMarkdownFiles()) {
          if (remaining <= 0) break;
          const tags = getAllTags(this.app.metadataCache.getFileCache(file) ?? {}) ?? [];
          if (!tags.includes(reference.tag)) continue;
          append({ path: file.path, content: await this.app.vault.cachedRead(file), kind: "tag" });
          if (result.length >= 50) break;
        }
      }
    }
    if (this.plugin.settings.autoAttachActiveNote && sourceView?.file && !selected && remaining > 0) {
      const content = await this.app.vault.cachedRead(sourceView.file);
      append({ path: sourceView.file.path, content, kind: "note" });
    }
    return result;
  }

  private appendUserMessage(task: WorkBuddyTask, text: string): void {
    task.messages.push({ id: this.nextMessageId(), role: "user", text, createdAt: Date.now() });
    this.renderUserMessage(task, text);
    this.schedulePersist();
  }

  private renderUserMessage(task: WorkBuddyTask, text: string): void {
    const message = task.messagesEl.createDiv({ cls: "workbuddy-message is-user" });
    message.createDiv({ text, cls: "workbuddy-message-body" });
    this.scrollToBottom(task);
  }

  private appendAssistantMessage(task: WorkBuddyTask): HTMLElement {
    const message = task.messagesEl.createDiv({ cls: "workbuddy-message is-assistant" });
    const label = message.createDiv({ cls: "workbuddy-message-label" });
    label.createSpan({ text: "WorkBuddy" });
    const body = message.createDiv({ cls: "workbuddy-message-body is-streaming" });
    body.setText("正在思考…");
    this.scrollToBottom(task);
    return body;
  }

  private async renderStoredMessages(task: WorkBuddyTask): Promise<void> {
    for (const message of task.messages) {
      if (message.role === "user") {
        this.renderUserMessage(task, message.text);
        continue;
      }
      const wrapper = task.messagesEl.createDiv({ cls: "workbuddy-message is-assistant" });
      const label = wrapper.createDiv({ cls: "workbuddy-message-label" });
      label.createSpan({ text: "WorkBuddy" });
      const body = wrapper.createDiv({ cls: "workbuddy-message-body" });
      await MarkdownRenderer.render(this.app, message.text, body, message.selection?.path ?? "", this);
      this.renderToolActivities(wrapper, message.toolActivities ?? []);
      this.renderSources(wrapper, message.sources ?? []);
      this.renderResponseActions(task, wrapper, message.text, message.selection ?? null, message);
    }
  }

  private async handleRuntimeEvent(task: WorkBuddyTask, event: RuntimeEvent): Promise<void> {
    switch (event.type) {
      case "status":
        this.setTaskStatus(task, event.status, event.detail ?? "");
        break;
      case "agent-text":
        if (!task.currentAssistantBody) task.currentAssistantBody = this.appendAssistantMessage(task);
        task.currentAssistantText += event.text;
        task.currentAssistantBody.setText(task.currentAssistantText);
        this.scrollToBottom(task);
        break;
      case "thought":
        this.appendThought(task, event.text);
        break;
      case "tool":
        this.renderTool(task, event);
        break;
      case "plan":
        this.appendPlan(task, event.text);
        break;
      case "turn-stop":
        await this.finalizeAssistant(task, event.reason);
        break;
      case "error":
        this.appendError(task, event.message);
        break;
      case "usage":
        break;
    }
  }

  private setTaskStatus(task: WorkBuddyTask, status: RuntimeStatus, detail: string): void {
    task.status = status;
    task.statusDetail = detail || status;
    this.renderTaskTabs();
    if (task.id === this.activeTaskId) this.refreshActiveStatus();
  }

  private refreshActiveStatus(): void {
    const task = this.getActiveTask();
    if (!this.statusEl || !task) return;
    this.statusEl.empty();
    this.statusEl.createSpan({ cls: "workbuddy-status-dot is-" + task.status });
    this.statusEl.createSpan({ text: task.statusDetail });
    if (this.sendButton) this.sendButton.disabled = task.status === "working" || task.status === "connecting";
    if (this.stopButton) this.stopButton.hidden = task.status !== "working";
    if (this.closeTaskButton) this.closeTaskButton.disabled = task.status === "working" || task.status === "connecting";
  }

  private appendThought(task: WorkBuddyTask, text: string): void {
    let thought = task.messagesEl.querySelector<HTMLElement>(".workbuddy-thought.is-current");
    if (!thought) {
      thought = task.messagesEl.createEl("details", { cls: "workbuddy-thought is-current" });
      thought.createEl("summary", { text: "思考过程" });
      thought.createEl("pre");
    }
    const pre = thought.querySelector("pre");
    if (pre) pre.textContent = (pre.textContent ?? "") + text;
  }

  private renderTool(task: WorkBuddyTask, event: Extract<RuntimeEvent, { type: "tool" }>): void {
    this.captureSources(task, `${event.title}\n${event.detail ?? ""}`);
    const previous = task.currentTurnTools.get(event.id);
    task.currentTurnTools.set(event.id, {
      id: event.id,
      title: event.title,
      status: event.status,
      detail: event.detail,
      createdAt: previous?.createdAt ?? Date.now()
    });
    let card = task.toolEls.get(event.id);
    if (!card) {
      card = task.messagesEl.createDiv({ cls: "workbuddy-tool" });
      task.toolEls.set(event.id, card);
    }
    card.empty();
    const icon = card.createSpan({ cls: "workbuddy-tool-icon" });
    setIcon(icon, "wrench");
    const main = card.createDiv({ cls: "workbuddy-tool-main" });
    main.createDiv({ text: event.title, cls: "workbuddy-tool-title" });
    main.createDiv({ text: event.status ?? "运行中", cls: "workbuddy-tool-status" });
    if (event.detail) main.createEl("pre", { text: event.detail });
    this.scrollToBottom(task);
  }

  private appendPlan(task: WorkBuddyTask, text: string): void {
    const card = task.messagesEl.createDiv({ cls: "workbuddy-plan" });
    card.createEl("strong", { text: "计划" });
    card.createEl("pre", { text });
  }

  private appendError(task: WorkBuddyTask, message: string): void {
    task.messagesEl.createDiv({ text: message, cls: "workbuddy-error" });
    this.scrollToBottom(task);
  }

  private async finalizeAssistant(task: WorkBuddyTask, reason: string): Promise<void> {
    task.messagesEl.querySelector(".workbuddy-thought.is-current")?.removeClass("is-current");
    const body = task.currentAssistantBody;
    const text = task.currentAssistantText;
    if (!body) {
      task.currentAssistantText = "";
      task.currentTurnSelection = null;
      task.currentTurnSources = [];
      task.currentTurnTools.clear();
      return;
    }
    body.removeClass("is-streaming");
    body.empty();
    if (text) {
      const sourcePath = task.currentTurnSelection?.path ?? this.app.workspace.getActiveFile()?.path ?? "";
      await MarkdownRenderer.render(this.app, text, body, sourcePath, this);
    } else {
      body.setText("本轮结束：" + reason);
    }
    const message = body.parentElement ?? body;
    const sources = dedupeSources([
      ...task.currentTurnSources,
      ...extractSourceReferences(text, this.app.vault.getFiles().map((file) => file.path))
    ]).slice(0, 20);
    const storedMessage: StoredChatMessage | null = text ? {
      id: this.nextMessageId(),
      role: "assistant",
      text,
      createdAt: Date.now(),
      selection: serializeSelection(task.currentTurnSelection),
      sources,
      toolActivities: [...task.currentTurnTools.values()].map((activity) => ({ ...activity }))
    } : null;
    this.renderToolActivities(message, storedMessage?.toolActivities ?? []);
    this.renderSources(message, sources);
    this.renderResponseActions(task, message, text, task.currentTurnSelection, storedMessage ?? undefined);
    if (storedMessage) task.messages.push(storedMessage);
    task.currentAssistantBody = null;
    task.currentAssistantText = "";
    task.currentTurnSelection = null;
    task.currentTurnSources = [];
    task.currentTurnTools.clear();
    this.scrollToBottom(task);
    this.schedulePersist();
  }

  private renderResponseActions(
    task: WorkBuddyTask,
    message: HTMLElement,
    text: string,
    selection: SelectionSnapshot | null,
    storedMessage?: StoredChatMessage
  ): void {
    if (!text) return;
    const actions = message.createDiv({ cls: "workbuddy-response-actions" });
    this.createAction(actions, "copy", "复制", () => void navigator.clipboard.writeText(text));
    if (storedMessage) {
      const favorite = this.createAction(actions, "star", storedMessage.favorite ? "取消收藏" : "收藏回答", () => {
        storedMessage.favorite = !storedMessage.favorite;
        favorite.toggleClass("is-favorite", storedMessage.favorite);
        favorite.setAttribute("aria-label", storedMessage.favorite ? "取消收藏" : "收藏回答");
        this.schedulePersist();
      });
      favorite.toggleClass("is-favorite", storedMessage.favorite === true);
    }
    this.createAction(actions, "text-cursor-input", "插入", () => this.insertIntoEditor(text, selection));
    if (selection) {
      this.createAction(actions, "replace", "替换原选区", () =>
        this.replaceCapturedSelection(task, text, selection)
      );
    }
    this.createAction(actions, "file-plus", "保存为笔记", () => void this.saveAsNote(text));
  }

  private renderToolActivities(message: HTMLElement, activities: StoredToolActivity[]): void {
    if (activities.length === 0) return;
    const details = message.createEl("details", { cls: "workbuddy-tool-history" });
    details.createEl("summary", { text: `工具操作 · ${activities.length}` });
    for (const activity of activities) {
      const row = details.createDiv({ cls: "workbuddy-tool-history-row" });
      row.createSpan({ text: activity.title });
      if (activity.status) row.createSpan({ text: activity.status, cls: "workbuddy-history-meta" });
      if (activity.detail) row.createEl("pre", { text: activity.detail });
    }
  }

  private captureSources(task: WorkBuddyTask, text: string): void {
    task.currentTurnSources = dedupeSources([
      ...task.currentTurnSources,
      ...extractSourceReferences(text, this.app.vault.getFiles().map((file) => file.path))
    ]).slice(0, 20);
  }

  private renderSources(message: HTMLElement, sources: StoredSourceReference[]): void {
    if (sources.length === 0) return;
    const details = message.createEl("details", { cls: "workbuddy-sources" });
    details.createEl("summary", { text: `参考来源 · ${sources.length}` });
    const list = details.createDiv({ cls: "workbuddy-source-list" });
    for (const source of sources) {
      const button = list.createEl("button", { cls: "workbuddy-source-link" });
      const icon = button.createSpan();
      setIcon(icon, source.kind === "web" ? "external-link" : "file-text");
      button.createSpan({ text: source.label });
      button.addEventListener("click", () => void this.openSource(source));
    }
  }

  private async openSource(source: StoredSourceReference): Promise<void> {
    if (source.kind === "web" && source.url) {
      window.open(source.url, "_blank", "noopener");
      return;
    }
    if (!source.path) return;
    const file = this.app.vault.getAbstractFileByPath(source.path);
    if (!(file instanceof TFile)) {
      new Notice("来源文件已不存在：" + source.path);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    if (!(leaf.view instanceof MarkdownView)) return;
    let line = source.line ? Math.max(0, source.line - 1) : undefined;
    if (source.heading) {
      line = this.app.metadataCache.getFileCache(file)?.headings?.find((heading) => heading.heading === source.heading)?.position.start.line ?? line;
    }
    if (line === undefined) return;
    const position = { line, ch: 0 };
    leaf.view.editor.setCursor(position);
    leaf.view.editor.scrollIntoView({ from: position, to: position }, true);
  }

  private createAction(parent: HTMLElement, iconName: string, label: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
    setIcon(button, iconName);
    button.addEventListener("click", action);
    return button;
  }

  private insertIntoEditor(text: string, selection: SelectionSnapshot | null): void {
    const capturedView = selection && selection.view?.file?.path === selection.path ? selection.view : null;
    const view = capturedView || (selection && this.findViewByPath(selection.path)) || this.getSourceView();
    if (!view) {
      new Notice("请先打开一个 Markdown 笔记");
      return;
    }
    const cursor = selection?.to ?? view.editor.getCursor("to");
    view.editor.replaceRange(text, cursor);
    this.lastEdit = {
      path: view.file?.path ?? selection?.path ?? "",
      from: cursor,
      toAfter: advancePosition(cursor, text),
      original: "",
      replacement: text
    };
    this.refreshUndoButton();
    view.editor.focus();
    new Notice("已插入：" + (view.file?.path ?? "当前笔记"));
  }

  private replaceCapturedSelection(
    task: WorkBuddyTask,
    text: string,
    selection: SelectionSnapshot
  ): void {
    const capturedView = selection.view?.file?.path === selection.path ? selection.view : null;
    const view = capturedView || this.findViewByPath(selection.path);
    if (!view || !selection.from || !selection.to) {
      new Notice("该选区来自阅读视图，已用于引用，但无法按原位置直接替换");
      return;
    }
    const currentText = view.editor.getRange(selection.from, selection.to);
    if (currentText !== selection.text) {
      new Notice("原选区内容已经变化，为避免误覆盖，本次没有替换", 6_000);
      return;
    }
    new DiffPreviewModal(this.app, selection.text, text, () => {
      const latestText = view.editor.getRange(selection.from!, selection.to!);
      if (latestText !== selection.text) {
        new Notice("原选区内容已经变化，为避免误覆盖，本次没有替换", 6_000);
        return;
      }
      view.editor.replaceRange(text, selection.from!, selection.to!);
      this.lastEdit = {
        path: selection.path,
        from: selection.from!,
        toAfter: advancePosition(selection.from!, text),
        original: selection.text,
        replacement: text
      };
      this.refreshUndoButton();
      view.editor.focus();
      if (task.selectionSnapshot?.path === selection.path && task.selectionSnapshot.text === selection.text) {
        task.selectionSnapshot = null;
        if (task.id === this.activeTaskId) this.refreshContextPills();
      }
      new Notice("已替换原选区，可用“撤销修改”恢复");
    }).open();
  }

  private undoLastEdit(): void {
    const edit = this.lastEdit;
    if (!edit) return;
    const view = this.findViewByPath(edit.path);
    if (!view) {
      new Notice("请先打开被修改的笔记再撤销");
      return;
    }
    if (view.editor.getRange(edit.from, edit.toAfter) !== edit.replacement) {
      new Notice("修改位置的内容已经变化，为避免误覆盖，未执行撤销", 6_000);
      return;
    }
    view.editor.replaceRange(edit.original, edit.from, edit.toAfter);
    view.editor.focus();
    this.lastEdit = null;
    this.refreshUndoButton();
    new Notice("已撤销 WorkBuddy 的最近一次修改");
  }

  private refreshUndoButton(): void {
    if (this.undoButton) this.undoButton.disabled = this.lastEdit === null;
  }

  private async saveAsNote(text: string): Promise<void> {
    const folder = "WorkBuddy";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    const path = normalizePath(folder + "/WorkBuddy-" + stamp + ".md");
    const file = await this.app.vault.create(path, text);
    await this.app.workspace.getLeaf(true).openFile(file);
    new Notice("已保存：" + path);
  }

  private refreshContextPills(): void {
    if (!this.contextEl) return;
    this.contextEl.empty();
    const task = this.getActiveTask();
    if (!task) return;

    const selected = this.plugin.settings.autoAttachSelection ? task.selectionSnapshot : null;
    if (selected) {
      const card = this.contextEl.createDiv({ cls: "workbuddy-selection-card" });
      const header = card.createDiv({ cls: "workbuddy-selection-header" });
      const title = header.createDiv({ cls: "workbuddy-selection-title" });
      title.createSpan({ text: "已引用选区 · " + selected.text.trim().length + "字" });
      title.createSpan({ text: selected.path, cls: "workbuddy-selection-path" });
      const remove = header.createEl("button", {
        text: "×",
        cls: "workbuddy-selection-remove",
        attr: { "aria-label": "移除选区引用", title: "移除选区引用" }
      });
      remove.addEventListener("click", () => this.clearSelectionContext(task));
      card.createDiv({ text: selected.text.trim(), cls: "workbuddy-selection-content" });
    } else if (this.plugin.settings.autoAttachActiveNote) {
      const source = this.getSourceView();
      const label = source?.file ? "当前笔记 · " + source.file.basename : "当前笔记";
      this.contextEl.createSpan({ text: label, cls: "workbuddy-context-pill is-active-note" });
    }

    for (const file of task.attachedFiles.values()) {
      const pill = this.contextEl.createSpan({ cls: "workbuddy-context-pill" });
      pill.createSpan({ text: `${file.extension === "md" ? "笔记" : "文件"} · ${file.name}` });
      const remove = pill.createEl("button", { text: "×", attr: { "aria-label": "移除 " + file.path } });
      remove.addEventListener("click", () => {
        task.attachedFiles.delete(file.path);
        if (task.id === this.activeTaskId) this.refreshContextPills();
        this.schedulePersist();
      });
    }
    for (const reference of task.contextReferences.values()) {
      const pill = this.contextEl.createSpan({ cls: "workbuddy-context-pill" });
      pill.createSpan({ text: contextReferenceLabel(reference) });
      const remove = pill.createEl("button", { text: "×", attr: { "aria-label": "移除 " + reference.label } });
      remove.addEventListener("click", () => {
        task.contextReferences.delete(reference.id);
        if (task.id === this.activeTaskId) this.refreshContextPills();
        this.schedulePersist();
      });
    }
  }

  private clearSelectionContext(task: WorkBuddyTask): void {
    const selected = task.selectionSnapshot;
    const view = selected && selected.view?.file?.path === selected.path ? selected.view : null;
    if (selected?.to && view?.editor.getSelection() === selected.text) view.editor.setCursor(selected.to);
    task.selectionSnapshot = null;
    if (task.id === this.activeTaskId) this.refreshContextPills();
  }

  private captureSelection(): boolean {
    const task = this.getActiveTask();
    if (!task) return false;
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) this.lastMarkdownView = activeView;

    const candidates = uniqueViews([
      activeView,
      this.lastMarkdownView,
      ...this.app.workspace.getLeavesOfType("markdown").map((leaf) =>
        leaf.view instanceof MarkdownView ? leaf.view : null
      )
    ]);
    for (const view of candidates) {
      if (!view.file) continue;
      const text = view.editor.getSelection();
      if (!text.trim()) continue;
      this.lastMarkdownView = view;
      task.selectionSnapshot = {
        path: view.file.path,
        text,
        from: view.editor.getCursor("from"),
        to: view.editor.getCursor("to"),
        view
      };
      this.refreshContextPills();
      return true;
    }

    const domSelection = window.getSelection();
    const anchor = domSelection?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
    const domText = domSelection?.toString() ?? "";
    const isNoteContent = anchorEl?.closest(".markdown-preview-view, .markdown-source-view, .canvas-node-content");
    if (domText.trim() && isNoteContent && !anchorEl?.closest(".workbuddy-view")) {
      const source = activeView ?? this.lastMarkdownView ?? candidates[0];
      if (source?.file) {
        this.lastMarkdownView = source;
        task.selectionSnapshot = { path: source.file.path, text: domText, view: source };
        this.refreshContextPills();
        return true;
      }
    }
    return false;
  }

  public async runSelectionQuickAction(
    prompt: string,
    view: MarkdownView,
    text: string,
    from: EditorPosition,
    to: EditorPosition,
    sendImmediately: boolean
  ): Promise<void> {
    if (!text.trim()) {
      new Notice("请先选中一段文字");
      return;
    }
    if (this.tasks.length === 0) await this.addTask(false);
    const task = this.getActiveTask();
    if (!task || !view.file) return;
    this.lastMarkdownView = view;
    task.selectionSnapshot = { path: view.file.path, text, from, to, view };
    this.refreshContextPills();
    this.inputEl.value = prompt;
    task.inputDraft = prompt;
    if (sendImmediately) await this.send();
    else this.inputEl.focus();
  }

  private renameTask(task: WorkBuddyTask): void {
    new TaskNameModal(this.app, task.title, (name) => {
      task.title = name;
      this.renderTaskTabs();
      this.schedulePersist();
    }).open();
  }

  private requestCloseTask(task: WorkBuddyTask): void {
    if (task.status === "working" || task.status === "connecting") {
      new Notice("请先停止当前任务再关闭");
      return;
    }
    if (task.messages.length === 0) this.closeTask(task);
    else new ConfirmTaskCloseModal(this.app, task.title, () => this.closeTask(task)).open();
  }

  private closeTask(task: WorkBuddyTask): void {
    const index = this.tasks.indexOf(task);
    if (index < 0) return;
    const wasActive = task.id === this.activeTaskId;
    this.closedChats = addClosedChat(this.closedChats, this.snapshotTask(task));
    task.unsubscribeRuntime();
    task.runtime.setPermissionHandler(null);
    task.runtime.disconnect();
    task.messagesEl.remove();
    this.tasks.splice(index, 1);
    if (this.tasks.length === 0) {
      void this.addTask(false);
    } else if (wasActive) {
      this.switchTask(this.tasks[Math.min(index, this.tasks.length - 1)]!.id);
    }
    this.renderTaskTabs();
    this.schedulePersist();
  }

  private openSaveChat(): void {
    const task = this.getActiveTask();
    if (!task || task.messages.length === 0) {
      new Notice("当前任务还没有可保存的聊天记录");
      return;
    }
    new SaveChatModal(this.app, task.title, task.messages, (title, selectedIds) => {
      void this.saveSelectedChat(title, task.messages, selectedIds);
    }).open();
  }

  private async saveSelectedChat(
    title: string,
    messages: StoredChatMessage[],
    selectedIds: ReadonlySet<string>
  ): Promise<void> {
    const selected = selectMessages(messages, selectedIds);
    if (selected.length === 0) return;
    await this.ensureFolder("WorkBuddy");
    await this.ensureFolder("WorkBuddy/Chats");
    const baseName = sanitizeFileName(title) || "WorkBuddy聊天记录";
    let path = normalizePath(`WorkBuddy/Chats/${baseName}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`WorkBuddy/Chats/${baseName}-${suffix++}.md`);
    }
    const file = await this.app.vault.create(path, buildChatMarkdown(title, selected));
    await this.app.workspace.getLeaf(true).openFile(file);
    new Notice(`已保存 ${selected.length} 条聊天记录：${path}`);
  }

  private openHistory(): void {
    const openTasks = this.tasks.map((task) => ({ task: this.snapshotTask(task), isOpen: true }));
    const closedTasks = this.closedChats.map((task) => ({ task, isOpen: false }));
    new ChatHistoryModal(
      this.app,
      [...openTasks, ...closedTasks].sort((a, b) => b.task.updatedAt - a.task.updatedAt),
      (chat) => this.switchTask(chat.id),
      (chat) => void this.restoreClosedChat(chat),
      (chat) => void this.exportFullTask(chat)
    ).open();
  }

  private async exportFullTask(task: StoredWorkBuddyTask): Promise<void> {
    await this.ensureFolder("WorkBuddy");
    await this.ensureFolder("WorkBuddy/Chats");
    const baseName = sanitizeFileName(task.title + "-完整记录") || "WorkBuddy完整记录";
    let path = normalizePath(`WorkBuddy/Chats/${baseName}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`WorkBuddy/Chats/${baseName}-${suffix++}.md`);
    }
    const file = await this.app.vault.create(path, buildFullTaskMarkdown(task));
    await this.app.workspace.getLeaf(true).openFile(file);
    new Notice(`已导出完整任务：${path}`);
  }

  private async restoreClosedChat(chat: StoredWorkBuddyTask): Promise<void> {
    if (!canAddWorkBuddyTask(this.tasks.length)) {
      new Notice("请先关闭一个任务页再恢复历史任务");
      return;
    }
    this.closedChats = this.closedChats.filter((item) => item.id !== chat.id);
    const restored = this.tasks.some((task) => task.id === chat.id)
      ? { ...chat, id: "task-" + this.nextTaskId++ }
      : chat;
    await this.addTask(false, restored);
    this.schedulePersist();
    new Notice("已恢复任务：“" + restored.title + "”");
  }

  private snapshotTask(task: WorkBuddyTask): StoredWorkBuddyTask {
    if (task.id === this.activeTaskId && this.inputEl) task.inputDraft = this.inputEl.value;
    return {
      id: task.id,
      title: task.title,
      inputDraft: task.inputDraft,
      attachedPaths: [...task.attachedFiles.keys()],
      contextReferences: [...task.contextReferences.values()].map((reference) => ({ ...reference })),
      messages: task.messages.map(cloneMessage),
      updatedAt: Date.now()
    };
  }

  private schedulePersist(): void {
    if (this.persistTimer !== null) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void this.persistWorkspace();
    }, 350);
  }

  private async persistWorkspace(): Promise<void> {
    const state: WorkBuddyWorkspaceState = {
      activeTaskId: this.activeTaskId,
      nextTaskId: this.nextTaskId,
      tasks: this.tasks.map((task) => this.snapshotTask(task)),
      closedChats: this.closedChats,
      contextPacks: this.contextPacks
    };
    await this.plugin.saveWorkspaceState(state);
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
  }

  private nextMessageId(): string {
    return `message-${Date.now()}-${this.messageSequence++}`;
  }

  private getActiveTask(): WorkBuddyTask | null {
    return this.tasks.find((task) => task.id === this.activeTaskId) ?? null;
  }

  private getSourceView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file) {
      this.lastMarkdownView = active;
      return active;
    }
    if (this.lastMarkdownView?.file) return this.lastMarkdownView;
    const leaf = this.app.workspace.getLeavesOfType("markdown").find((candidate) =>
      candidate.view instanceof MarkdownView && Boolean(candidate.view.file)
    );
    return leaf?.view instanceof MarkdownView ? leaf.view : null;
  }

  private findViewByPath(path: string): MarkdownView | null {
    for (const task of this.tasks) {
      if (task.selectionSnapshot?.view?.file?.path === path) return task.selectionSnapshot.view;
    }
    if (this.lastMarkdownView?.file?.path === path) return this.lastMarkdownView;
    const leaf = this.app.workspace.getLeavesOfType("markdown").find(
      (candidate) => candidate.view instanceof MarkdownView && candidate.view.file?.path === path
    );
    return leaf?.view instanceof MarkdownView ? leaf.view : null;
  }

  private scrollToBottom(task: WorkBuddyTask): void {
    requestAnimationFrame(() =>
      task.messagesEl.scrollTo({ top: task.messagesEl.scrollHeight, behavior: "smooth" })
    );
  }
}

function uniqueViews(views: Array<MarkdownView | null>): MarkdownView[] {
  return [...new Set(views.filter((view): view is MarkdownView => Boolean(view)))];
}

function serializeSelection(selection: SelectionSnapshot | null): StoredSelection | undefined {
  if (!selection) return undefined;
  return {
    path: selection.path,
    text: selection.text,
    from: selection.from ? { ...selection.from } : undefined,
    to: selection.to ? { ...selection.to } : undefined
  };
}

function cloneMessage(message: StoredChatMessage): StoredChatMessage {
  return {
    ...message,
    selection: message.selection
      ? {
          ...message.selection,
          from: message.selection.from ? { ...message.selection.from } : undefined,
          to: message.selection.to ? { ...message.selection.to } : undefined
        }
      : undefined,
    sources: message.sources?.map((source) => ({ ...source })),
    toolActivities: message.toolActivities?.map((activity) => ({ ...activity }))
  };
}

function advancePosition(start: EditorPosition, text: string): EditorPosition {
  const lines = text.split("\n");
  if (lines.length === 1) return { line: start.line, ch: start.ch + text.length };
  return { line: start.line + lines.length - 1, ch: lines.at(-1)?.length ?? 0 };
}

function buildHistoryContext(messages: StoredChatMessage[], maxChars = 12_000): string {
  const chunks: string[] = [];
  let length = 0;
  for (const message of [...messages].reverse()) {
    const chunk = `${message.role === "user" ? "用户" : "WorkBuddy"}：${message.text}`;
    if (length + chunk.length > maxChars && chunks.length > 0) break;
    chunks.unshift(chunk.slice(0, Math.max(0, maxChars - length)));
    length += chunk.length;
  }
  return chunks.join("\n\n");
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|#\[\]^]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}

function contextReferenceLabel(reference: StoredContextReference): string {
  if (reference.kind === "folder") return `文件夹 · ${reference.path ?? reference.label}`;
  if (reference.kind === "tag") return `标签 · ${reference.tag ?? reference.label}`;
  return `标题 · ${reference.path ?? ""}#${reference.heading ?? reference.label}`;
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface WorkBuddyNativeDialog {
  showOpenDialog(options: {
    title: string;
    buttonLabel: string;
    properties: Array<"openFile" | "multiSelections">;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

function getElectronDialog(): WorkBuddyNativeDialog | null {
  try {
    const electron = require("electron") as {
      dialog?: WorkBuddyNativeDialog;
      remote?: { dialog?: WorkBuddyNativeDialog };
    };
    return electron.dialog ?? electron.remote?.dialog ?? null;
  } catch {
    return null;
  }
}
