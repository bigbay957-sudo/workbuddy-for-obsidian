import { Modal, type App } from "obsidian";
import type { StoredChatMessage, StoredWorkBuddyTask } from "../core/chat-persistence";
import { computeTextDiff } from "../core/text-diff";

export class TaskNameModal extends Modal {
  constructor(app: App, private readonly currentName: string, private readonly onSubmit: (name: string) => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-small-modal");
    this.titleEl.setText("重命名任务");
    const input = this.contentEl.createEl("input", { type: "text", value: this.currentName });
    input.maxLength = 40;
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const save = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    const submit = (): void => {
      const name = input.value.trim();
      if (!name) return;
      this.close();
      this.onSubmit(name);
    };
    cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    window.setTimeout(() => input.select());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmTaskCloseModal extends Modal {
  constructor(app: App, private readonly title: string, private readonly onConfirm: () => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-small-modal");
    this.titleEl.setText("关闭任务");
    this.contentEl.createEl("p", { text: `关闭“${this.title}”后，对话会自动保存在历史记录中。` });
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const close = actions.createEl("button", { text: "关闭任务", cls: "mod-warning" });
    close.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class SaveChatModal extends Modal {
  private selected = new Set<string>();

  constructor(
    app: App,
    private readonly defaultTitle: string,
    private readonly messages: StoredChatMessage[],
    private readonly onSave: (title: string, selectedIds: ReadonlySet<string>) => void
  ) {
    super(app);
    for (const message of messages) this.selected.add(message.id);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-save-chat-modal");
    this.titleEl.setText("选择要保存的聊天记录");
    const titleInput = this.contentEl.createEl("input", {
      type: "text",
      value: this.defaultTitle,
      cls: "workbuddy-save-chat-title"
    });
    titleInput.maxLength = 80;
    const list = this.contentEl.createDiv({ cls: "workbuddy-chat-choice-list" });
    for (const message of this.messages) {
      const row = list.createEl("label", { cls: "workbuddy-chat-choice" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = true;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(message.id);
        else this.selected.delete(message.id);
      });
      const content = row.createDiv();
      content.createDiv({ text: message.role === "user" ? "我" : "WorkBuddy", cls: "workbuddy-chat-choice-role" });
      content.createDiv({ text: truncate(message.text, 180), cls: "workbuddy-chat-choice-preview" });
    }
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "保存为 Markdown", cls: "mod-cta" });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim();
      if (!title || this.selected.size === 0) return;
      this.close();
      this.onSave(title, new Set(this.selected));
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ChatHistoryModal extends Modal {
  constructor(
    app: App,
    private readonly chats: Array<{ task: StoredWorkBuddyTask; isOpen: boolean }>,
    private readonly onOpenTask: (chat: StoredWorkBuddyTask) => void,
    private readonly onRestore: (chat: StoredWorkBuddyTask) => void,
    private readonly onExport: (chat: StoredWorkBuddyTask) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-history-modal");
    this.titleEl.setText("任务历史");
    if (this.chats.length === 0) {
      this.contentEl.createEl("p", { text: "还没有聊天记录。当前打开的任务会自动保存，并在下次启动时恢复。", cls: "workbuddy-empty-hint" });
      return;
    }
    const search = this.contentEl.createEl("input", {
      type: "search",
      cls: "workbuddy-history-search",
      attr: { placeholder: "搜索任务名或聊天内容…" }
    });
    const list = this.contentEl.createDiv({ cls: "workbuddy-history-list" });
    const render = (): void => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const matched = this.chats.filter(({ task }) => !query || `${task.title}\n${task.messages.map((message) => message.text).join("\n")}`.toLowerCase().includes(query));
      if (matched.length === 0) {
        list.createEl("p", { text: "没有匹配的任务记录。", cls: "workbuddy-empty-hint" });
        return;
      }
      for (const entry of matched) {
        const chat = entry.task;
        const row = list.createDiv({ cls: "workbuddy-history-row" });
        const main = row.createDiv({ cls: "workbuddy-history-main" });
        const favorites = chat.messages.filter((message) => message.favorite).length;
        main.createDiv({ text: chat.title, cls: "workbuddy-history-title" });
        main.createDiv({
          text: `${entry.isOpen ? "已打开 · " : "已关闭 · "}${chat.messages.length} 条消息${favorites ? ` · ${favorites} 条收藏` : ""} · ${new Date(chat.updatedAt).toLocaleString()}`,
          cls: "workbuddy-history-meta"
        });
        const exportButton = row.createEl("button", { text: "导出" });
        exportButton.addEventListener("click", () => this.onExport(chat));
        const primary = row.createEl("button", { text: entry.isOpen ? "切换" : "恢复", cls: "mod-cta" });
        primary.addEventListener("click", () => {
          this.close();
          if (entry.isOpen) this.onOpenTask(chat);
          else this.onRestore(chat);
        });
      }
    };
    search.addEventListener("input", render);
    render();
    window.setTimeout(() => search.focus());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class DiffPreviewModal extends Modal {
  constructor(app: App, private readonly original: string, private readonly replacement: string, private readonly onApply: () => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-diff-modal");
    this.titleEl.setText("确认替换内容");
    const diff = computeTextDiff(this.original, this.replacement);
    const grid = this.contentEl.createDiv({ cls: "workbuddy-diff-grid" });
    this.renderSide(grid, "原内容", diff.before, diff.removed, diff.after, "is-removed");
    this.renderSide(grid, "替换后", diff.before, diff.added, diff.after, "is-added");
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const apply = actions.createEl("button", { text: "确认替换", cls: "mod-cta" });
    apply.addEventListener("click", () => {
      this.close();
      this.onApply();
    });
  }

  private renderSide(parent: HTMLElement, title: string, before: string, changed: string, after: string, className: string): void {
    const side = parent.createDiv({ cls: "workbuddy-diff-side" });
    side.createDiv({ text: title, cls: "workbuddy-diff-title" });
    const preview = side.createEl("pre", { cls: "workbuddy-diff-preview" });
    preview.createSpan({ text: before });
    preview.createEl("mark", { text: changed || "（无）", cls: className });
    preview.createSpan({ text: after });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function truncate(text: string, limit: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? compact.slice(0, limit) + "…" : compact;
}
