import { FileSystemAdapter, MarkdownView, Notice, Plugin, addIcon, type Editor, type MarkdownFileInfo } from "obsidian";
import { join } from "node:path";
import {
  EMPTY_WORKSPACE_STATE,
  normalizeWorkspaceState,
  type WorkBuddyWorkspaceState
} from "./core/chat-persistence";
import { WorkBuddyClient } from "./core/workbuddy-client";
import { checkPluginUpdate, hasNewerVersion, installPluginUpdate } from "./core/plugin-updater";
import { WORKBUDDY_ICON_ID, WORKBUDDY_ICON_SVG } from "./core/workbuddy-icon";
import { WorkBuddySettingTab } from "./settings";
import { DEFAULT_SETTINGS, type WorkBuddySettings } from "./types";
import { WORKBUDDY_VIEW_TYPE, WorkBuddyChatView } from "./ui/chat-view";
import { UpdateModal } from "./ui/update-modal";

export default class WorkBuddyPlugin extends Plugin {
  settings: WorkBuddySettings = { ...DEFAULT_SETTINGS };
  private vaultPath = "";
  private workspaceState: WorkBuddyWorkspaceState = { ...EMPTY_WORKSPACE_STATE };
  private saveQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    await this.loadSettings();
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("WorkBuddy for Obsidian 仅支持桌面端文件系统知识库。", 8_000);
      return;
    }

    this.vaultPath = adapter.getBasePath();
    addIcon(WORKBUDDY_ICON_ID, WORKBUDDY_ICON_SVG);
    this.registerView(WORKBUDDY_VIEW_TYPE, (leaf) => new WorkBuddyChatView(leaf, this));

    this.addRibbonIcon(WORKBUDDY_ICON_ID, "打开 WorkBuddy", () => void this.activateView());
    this.addCommand({
      id: "open-workbuddy",
      name: "打开 WorkBuddy 侧边栏",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "new-workbuddy-chat",
      name: "新增 WorkBuddy 任务页",
      callback: async () => {
        const view = await this.activateView();
        await view.addTask();
      }
    });
    this.addCommand({
      id: "check-workbuddy-updates",
      name: "检查 WorkBuddy 插件更新",
      callback: () => void this.checkForUpdates(true)
    });
    this.registerSelectionActions();

    this.addSettingTab(new WorkBuddySettingTab(this.app, this));
    if (this.settings.autoCheckUpdates && this.settings.updateRepository) {
      const timer = window.setTimeout(() => void this.checkForUpdates(false), 8_000);
      this.register(() => window.clearTimeout(timer));
    }
  }

  async checkForUpdates(showCurrent = true): Promise<void> {
    if (!this.settings.updateRepository) {
      if (showCurrent) new Notice("请先在 WorkBuddy 插件设置中填写 GitHub 更新仓库。", 6_000);
      return;
    }
    try {
      const info = await checkPluginUpdate(this.settings.updateRepository, this.manifest.version);
      if (!hasNewerVersion(info)) {
        if (showCurrent) new Notice(`当前已是最新版本 ${this.manifest.version}`);
        return;
      }
      new UpdateModal(this.app, info, async () => {
        try {
          const pluginDirectory = join(this.vaultPath, this.app.vault.configDir, "plugins", this.manifest.id);
          const backup = await installPluginUpdate(info, pluginDirectory, this.manifest.id);
          new Notice(`已安装 ${info.version}。请关闭再启用插件或重载 Obsidian。旧版本备份在 ${backup}`, 12_000);
        } catch (error) {
          new Notice("安装更新失败：" + readPluginError(error), 10_000);
          throw error;
        }
      }).open();
    } catch (error) {
      if (showCurrent) new Notice("检查更新失败：" + readPluginError(error), 8_000);
    }
  }

  createRuntime(): WorkBuddyClient {
    if (!this.vaultPath) throw new Error("WorkBuddy 知识库路径尚未初始化");
    return new WorkBuddyClient(() => this.settings, this.vaultPath);
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as (Partial<WorkBuddySettings> & { workspaceState?: unknown }) | null;
    const { workspaceState: _workspaceState, ...storedSettings } = data ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
    if (!this.settings.updateRepository) this.settings.updateRepository = DEFAULT_SETTINGS.updateRepository;
    this.workspaceState = normalizeWorkspaceState(data?.workspaceState);
  }

  async saveSettings(): Promise<void> {
    await this.queueSave();
  }

  getWorkspaceState(): WorkBuddyWorkspaceState {
    return normalizeWorkspaceState(this.workspaceState);
  }

  async saveWorkspaceState(state: WorkBuddyWorkspaceState): Promise<void> {
    this.workspaceState = normalizeWorkspaceState(state);
    await this.queueSave();
  }

  async activateView(): Promise<WorkBuddyChatView> {
    const existing = this.app.workspace.getLeavesOfType(WORKBUDDY_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("无法创建 WorkBuddy 侧边栏");
    if (!existing) await leaf.setViewState({ type: WORKBUDDY_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof WorkBuddyChatView)) throw new Error("WorkBuddy 侧边栏尚未就绪");
    return leaf.view;
  }

  private registerSelectionActions(): void {
    const actions = [
      { id: "polish-selection", name: "润色选区", prompt: "请润色这段文字，保持原意，提升表达的清晰度、专业度和流畅度。", send: true },
      { id: "summarize-selection", name: "总结选区", prompt: "请总结这段文字，提炼关键结论和行动项。", send: true },
      { id: "shorten-selection", name: "缩写选区", prompt: "请在保留核心事实、数据和结论的前提下缩写这段文字，删除重复和空泛表达。", send: true },
      { id: "expand-selection", name: "扩写选区", prompt: "请在不改变核心意思的前提下扩写这段文字，使内容更完整、更有说服力。", send: true },
      { id: "table-selection", name: "选区转表格", prompt: "请将这段内容整理为清晰的 Markdown 表格；不得编造缺失字段或数据，无法判断的内容标记为待确认。", send: true },
      { id: "outline-selection", name: "生成汇报提纲", prompt: "请根据这段内容生成适合工作汇报的分层提纲，突出核心结论、证据和下一步行动。", send: true },
      { id: "custom-selection-task", name: "基于选区自定义任务", prompt: "", send: false }
    ] as const;

    for (const action of actions) {
      this.addCommand({
        id: action.id,
        name: "WorkBuddy：" + action.name,
        editorCallback: (editor, view) => void this.runSelectionAction(editor, view, action.prompt, action.send)
      });
    }

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!editor.getSelection().trim()) return;
        menu.addSeparator();
        for (const action of actions) {
          menu.addItem((item) =>
            item
              .setTitle("WorkBuddy：" + action.name)
              .setIcon(WORKBUDDY_ICON_ID)
              .onClick(() => void this.runSelectionAction(editor, view, action.prompt, action.send))
          );
        }
      })
    );
  }

  private async runSelectionAction(
    editor: Editor,
    view: MarkdownView | MarkdownFileInfo,
    prompt: string,
    sendImmediately: boolean
  ): Promise<void> {
    const text = editor.getSelection();
    if (!text.trim()) {
      new Notice("请先选中一段文字");
      return;
    }
    if (!(view instanceof MarkdownView)) {
      new Notice("该编辑器暂不支持 WorkBuddy 选区操作");
      return;
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const chat = await this.activateView();
    await chat.runSelectionQuickAction(prompt, view, text, from, to, sendImmediately);
  }

  private queueSave(): Promise<void> {
    const data = { ...this.settings, workspaceState: this.workspaceState };
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.saveData(data));
    return this.saveQueue;
  }
}

function readPluginError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
