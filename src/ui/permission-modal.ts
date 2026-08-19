import { App, Modal, Setting } from "obsidian";
import type { PermissionChoice, PermissionPrompt } from "../types";

export class PermissionModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly prompt: PermissionPrompt,
    private readonly resolveChoice: (choice: PermissionChoice | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("workbuddy-permission-modal");
    contentEl.createEl("h2", { text: "WorkBuddy 请求执行操作" });
    contentEl.createEl("p", { text: this.prompt.title });
    contentEl.createEl("code", { text: this.prompt.toolName });

    if (this.prompt.rawInput !== undefined) {
      const details = contentEl.createEl("details");
      details.createEl("summary", { text: "查看参数" });
      details.createEl("pre", { text: safeStringify(this.prompt.rawInput) });
    }

    for (const option of this.prompt.options) {
      new Setting(contentEl)
        .setName(option.name)
        .setDesc(permissionDescription(option.kind))
        .addButton((button) => {
          button.setButtonText(option.kind.includes("reject") ? "拒绝" : "选择");
          if (option.kind.includes("always")) button.setWarning();
          button.onClick(() => this.finish({ optionId: option.optionId }));
        });
    }
  }

  onClose(): void {
    if (!this.settled) this.finish(null);
    this.contentEl.empty();
  }

  private finish(choice: PermissionChoice | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveChoice(choice);
    this.close();
  }
}

function permissionDescription(kind: string): string {
  if (kind === "allow_once") return "只批准这一次操作";
  if (kind === "allow_always") return "对同类操作持续放行，请谨慎选择";
  if (kind.includes("reject")) return "拒绝本次操作";
  return kind;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2).slice(0, 8_000);
  } catch {
    return String(value).slice(0, 8_000);
  }
}
