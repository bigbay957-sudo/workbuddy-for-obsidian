import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WorkBuddyPlugin from "./main";
import { resolveWorkBuddyExecutable } from "./core/workbuddy-client";

export class WorkBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WorkBuddyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "WorkBuddy for Obsidian" });
    containerEl.createEl("p", {
      text: "插件通过本机 codebuddy --acp 私有进程连接，不开放端口，也不保存模型 API Key。"
    });

    new Setting(containerEl)
      .setName("WorkBuddy CLI 路径")
      .setDesc("留空自动检测。当前机器通常为 ~/.local/bin/codebuddy。")
      .addText((text) =>
        text
          .setPlaceholder("自动检测")
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (value) => {
            this.plugin.settings.cliPath = value.trim();
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button.setButtonText("检测").onClick(() => {
          const resolved = resolveWorkBuddyExecutable(this.plugin.settings.cliPath);
          new Notice(resolved ? `已找到：${resolved}` : "未找到 codebuddy，请检查安装或填写完整路径。", 6_000);
        })
      );

    new Setting(containerEl)
      .setName("模型")
      .setDesc("留空使用 WorkBuddy 默认模型；填写模型 ID 后仅影响新连接。")
      .addText((text) =>
        text
          .setPlaceholder("default-model")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("权限模式")
      .setDesc("推荐 default。插件不会启用 bypassPermissions。修改后重新连接生效。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("default", "默认：逐项确认")
          .addOption("acceptEdits", "接受编辑，其它操作确认")
          .addOption("plan", "计划：只读")
          .addOption("dontAsk", "不询问：拒绝需要确认的操作")
          .addOption("auto", "WorkBuddy 自动模式")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value) => {
            this.plugin.settings.permissionMode = value as typeof this.plugin.settings.permissionMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动附加当前笔记")
      .setDesc("发送时把当前 Markdown 笔记作为参考资料。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoAttachActiveNote).onChange(async (value) => {
          this.plugin.settings.autoAttachActiveNote = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("优先附加选区")
      .setDesc("编辑器中有选区时，只附加选区而不是整篇笔记。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoAttachSelection).onChange(async (value) => {
          this.plugin.settings.autoAttachSelection = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("上下文字符上限")
      .setDesc("所有附加笔记合计的最大字符数，避免一次发送过多内容。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxContextChars))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) {
              this.plugin.settings.maxContextChars = Math.min(200_000, Math.max(1_000, parsed));
              await this.plugin.saveSettings();
            }
          })
      );

    containerEl.createEl("h3", { text: "插件更新" });
    new Setting(containerEl)
      .setName("GitHub 更新仓库")
      .setDesc("发布后填写 owner/repository 或完整 GitHub 地址。插件只从该仓库的 latest release 下载标准三文件。")
      .addText((text) =>
        text
          .setPlaceholder("bigbay/workbuddy-for-obsidian")
          .setValue(this.plugin.settings.updateRepository)
          .onChange(async (value) => {
            this.plugin.settings.updateRepository = value.trim();
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) => button.setButtonText("检查更新").onClick(() => void this.plugin.checkForUpdates(true)));

    new Setting(containerEl)
      .setName("启动时检查更新")
      .setDesc("启用后，每次加载插件会检查一次 latest release；不会自动安装。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoCheckUpdates).onChange(async (value) => {
          this.plugin.settings.autoCheckUpdates = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
