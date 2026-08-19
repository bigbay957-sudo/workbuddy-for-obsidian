import { Modal, Notice, type App } from "obsidian";
import type { PluginUpdateInfo } from "../core/plugin-updater";

export class UpdateModal extends Modal {
  constructor(app: App, private readonly info: PluginUpdateInfo, private readonly onInstall: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("workbuddy-update-modal");
    this.titleEl.setText(`发现 WorkBuddy ${this.info.version}`);
    this.contentEl.createEl("p", { text: `当前版本 ${this.info.currentVersion}，可更新到 ${this.info.version}。` });
    if (this.info.publishedAt) this.contentEl.createEl("p", { text: `发布时间：${new Date(this.info.publishedAt).toLocaleString()}`, cls: "workbuddy-empty-hint" });
    if (this.info.notes) this.contentEl.createEl("pre", { text: this.info.notes, cls: "workbuddy-update-notes" });
    const actions = this.contentEl.createDiv({ cls: "workbuddy-modal-actions" });
    const release = actions.createEl("button", { text: "查看发布页" });
    release.addEventListener("click", () => window.open(this.info.releaseUrl, "_blank", "noopener"));
    actions.createEl("button", { text: "稍后" }).addEventListener("click", () => this.close());
    const install = actions.createEl("button", { text: "安装更新", cls: "mod-cta" });
    install.addEventListener("click", async () => {
      install.disabled = true;
      install.setText("正在安装…");
      try {
        await this.onInstall();
        this.close();
      } catch (error) {
        install.disabled = false;
        install.setText("重试安装");
        new Notice("更新没有完成，请检查网络或 Release 三文件。", 8_000);
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
