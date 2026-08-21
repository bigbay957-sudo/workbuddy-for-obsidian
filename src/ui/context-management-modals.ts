import { Modal, type App } from "obsidian";
import type { RelatedNote } from "../core/related-notes";

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
