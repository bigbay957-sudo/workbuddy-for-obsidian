import { Modal, setIcon, type App } from "obsidian";
import type { ProjectContextPack } from "../core/chat-persistence";
import type { RelatedNote } from "../core/related-notes";

export class ContextPackModal extends Modal {
  constructor(
    app: App,
    private readonly packs: ProjectContextPack[],
    private readonly currentReferenceCount: number,
    private readonly onSaveCurrent: (name: string) => void,
    private readonly onApply: (pack: ProjectContextPack) => void,
    private readonly onDelete: (pack: ProjectContextPack) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-context-pack-modal");
    this.titleEl.setText("项目资料包");
    this.contentEl.createEl("p", {
      text: "把一组笔记、文件夹、标签或标题保存为可重复使用的项目上下文。",
      cls: "workbuddy-empty-hint"
    });
    const createRow = this.contentEl.createDiv({ cls: "workbuddy-pack-create" });
    const input = createRow.createEl("input", { type: "text", attr: { placeholder: "例如：广州逸合中心投标" } });
    input.maxLength = 60;
    const save = createRow.createEl("button", { text: "保存当前资料", cls: "mod-cta" });
    save.disabled = this.currentReferenceCount === 0;
    save.title = save.disabled ? "请先在当前任务中添加资料" : `保存当前 ${this.currentReferenceCount} 项资料`;
    const submit = (): void => {
      const name = input.value.trim();
      if (!name || save.disabled) return;
      this.close();
      this.onSaveCurrent(name);
    };
    save.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });

    const list = this.contentEl.createDiv({ cls: "workbuddy-pack-list" });
    if (this.packs.length === 0) {
      list.createEl("p", { text: "还没有资料包。先给当前任务添加资料，再保存为项目资料包。", cls: "workbuddy-empty-hint" });
      return;
    }
    for (const pack of this.packs) {
      const row = list.createDiv({ cls: "workbuddy-pack-row" });
      const main = row.createDiv({ cls: "workbuddy-pack-main" });
      main.createDiv({ text: pack.name, cls: "workbuddy-pack-title" });
      main.createDiv({
        text: `${pack.attachedPaths.length + pack.contextReferences.length} 项资料 · ${new Date(pack.updatedAt).toLocaleDateString()}`,
        cls: "workbuddy-history-meta"
      });
      const apply = row.createEl("button", { text: "应用" });
      apply.addEventListener("click", () => {
        this.close();
        this.onApply(pack);
      });
      const remove = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "删除资料包", title: "删除资料包" } });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => {
        this.close();
        new ConfirmContextPackDeleteModal(this.app, pack, this.onDelete).open();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ConfirmContextPackDeleteModal extends Modal {
  constructor(app: App, private readonly pack: ProjectContextPack, private readonly onDelete: (pack: ProjectContextPack) => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-small-modal");
    this.titleEl.setText("删除资料包");
    this.contentEl.createEl("p", { text: `确定删除“${this.pack.name}”吗？已经应用到任务中的资料不会移除。` });
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { text: "删除", cls: "mod-warning" });
    remove.addEventListener("click", () => {
      this.close();
      this.onDelete(this.pack);
    });
  }
}

export class RelatedNotesModal extends Modal {
  constructor(
    app: App,
    private readonly sourcePath: string,
    private readonly notes: RelatedNote[],
    private readonly onAttach: (path: string) => void,
    private readonly onOpenNote: (path: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-related-modal");
    this.titleEl.setText("关联资料推荐");
    this.contentEl.createEl("p", { text: `基于链接、标签和标题匹配：${this.sourcePath}`, cls: "workbuddy-empty-hint" });
    if (this.notes.length === 0) {
      this.contentEl.createEl("p", { text: "暂未发现高相关笔记。增加双链、标签或明确标题后，推荐会更准确。", cls: "workbuddy-empty-hint" });
      return;
    }
    for (const note of this.notes) {
      const row = this.contentEl.createDiv({ cls: "workbuddy-related-row" });
      const main = row.createDiv({ cls: "workbuddy-history-main" });
      const title = main.createEl("button", { text: note.title, cls: "workbuddy-related-title" });
      title.addEventListener("click", () => this.onOpenNote(note.path));
      main.createDiv({ text: note.path, cls: "workbuddy-history-meta" });
      main.createDiv({ text: note.reasons.join(" · "), cls: "workbuddy-related-reasons" });
      const attach = row.createEl("button", { text: "添加" });
      attach.addEventListener("click", () => this.onAttach(note.path));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
