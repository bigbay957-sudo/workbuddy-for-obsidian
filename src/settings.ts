import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WorkBuddyPlugin from "./main";
import { resolveWorkBuddyExecutable } from "./core/workbuddy-client";
import { applyBodyFontFamily, applyBodyFontSize, applyThoughtFontSize } from "./ui/display-settings";

export class WorkBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WorkBuddyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setHeading().setName("WorkBuddy AI");
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
      .setName("主题色")
      .setDesc("侧边栏主色调，立即生效并保留。")
      .addColorPicker((picker) =>
        picker
          .setValue(this.plugin.settings.themeColor)
          .onChange(async (value) => {
            this.plugin.settings.themeColor = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("权限模式")
      .setDesc("默认 bypassPermissions（最大权限，CLI 不再逐项询问）。修改后重新连接生效。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("bypassPermissions", "最大权限：全部放行（默认）")
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
      .setName("自动批准权限请求")
      .setDesc("开启后，若 CLI 仍发起权限询问，插件直接选择「允许」，不再弹出选择窗口。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoApprovePermissions).onChange(async (value) => {
          this.plugin.settings.autoApprovePermissions = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("回答正文字号")
      .setDesc("侧边栏里 AI 回答正文的字号。默认 13px，比 Obsidian 编辑器正文小一号，接近主流互联网产品的观感。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("11", "11px（极小）")
          .addOption("12", "12px（很小）")
          .addOption("13", "13px（默认）")
          .addOption("14", "14px（标准）")
          .addOption("15", "15px（偏大）")
          .addOption("16", "16px（同 Obsidian 正文）")
          .setValue(String(this.plugin.settings.bodyFontSize))
          .onChange(async (value) => {
            this.plugin.settings.bodyFontSize = Number.parseInt(value, 10);
            await this.plugin.saveSettings();
            applyBodyFontSize(this.plugin.settings.bodyFontSize);
          })
      );

    new Setting(containerEl)
      .setName("回答正文字体")
      .setDesc("默认使用无衬线字体栈（SF Pro / Inter + 苹方），并按 antialiased 渲染让字形更纤细；也可跟随 Obsidian 主题字体。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("sans", "无衬线（默认）")
          .addOption("theme", "跟随 Obsidian 主题")
          .setValue(this.plugin.settings.bodyFontFamily)
          .onChange(async (value) => {
            this.plugin.settings.bodyFontFamily = value === "theme" ? "theme" : "sans";
            await this.plugin.saveSettings();
            applyBodyFontFamily(this.plugin.settings.bodyFontFamily);
          })
      );

    new Setting(containerEl)
      .setName("思考内容字号")
      .setDesc("侧边栏「思考过程」折叠块的字号，默认 11px，立即生效。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("9", "9px（极小）")
          .addOption("10", "10px（很小）")
          .addOption("11", "11px（默认）")
          .addOption("12", "12px（原大小）")
          .addOption("13", "13px（偏大）")
          .addOption("14", "14px（大）")
          .setValue(String(this.plugin.settings.thoughtFontSize))
          .onChange(async (value) => {
            this.plugin.settings.thoughtFontSize = Number.parseInt(value, 10);
            await this.plugin.saveSettings();
            applyThoughtFontSize(this.plugin.settings.thoughtFontSize);
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

    new Setting(containerEl)
      .setName("显示工具调用")
      .setDesc("关闭后只保留思考过程和最终回答，隐藏命令、文件读写等工具调用详情。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showToolCalls).onChange(async (value) => {
          this.plugin.settings.showToolCalls = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("常驻指令")
      .setDesc("对所有对话生效的人设或要求；可通过侧边栏右上角设置菜单或输入框 # 编辑。留空则不附加。")
      .addTextArea((text) =>
        text
          .setPlaceholder("例如：回答简洁、优先用表格、中文输出…")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setHeading().setName("快捷指令");
    containerEl.createEl("p", {
      text: "在侧边栏右下角“快捷”面板中显示的自定义指令。点击后会把指令与当前选区一起发送给 WorkBuddy。",
      cls: "setting-item-description"
    });
    const customWrap = containerEl.createDiv({ cls: "workbuddy-settings-quick-actions" });
    this.renderQuickActionsSettings(customWrap);
    new Setting(containerEl)
      .setName("添加自定义快捷指令")
      .addButton((button) =>
        button.setButtonText("添加").onClick(async () => {
          this.plugin.settings.customQuickActions.push({ name: "新指令", prompt: "" });
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl).setHeading().setName("插件更新");
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

  private renderQuickActionsSettings(parent: HTMLElement): void {
    parent.empty();
    const items = this.plugin.settings.customQuickActions;
    if (items.length === 0) {
      parent.createEl("p", {
        text: "暂无自定义指令。点击下方“添加”创建，或使用内置指令。",
        cls: "setting-item-description"
      });
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const row = parent.createDiv({ cls: "workbuddy-quick-action-row" });
      const nameInput = row.createEl("input", {
        cls: "workbuddy-quick-action-name",
        type: "text",
        value: item.name,
        attr: { placeholder: "名称（面板中显示）" }
      });
      nameInput.addEventListener("change", async () => {
        this.plugin.settings.customQuickActions[i]!.name = nameInput.value;
        await this.plugin.saveSettings();
      });
      const promptInput = row.createEl("textarea", {
        cls: "workbuddy-quick-action-prompt",
        attr: { placeholder: "提示词（会与选区一起发送）", rows: "3" }
      });
      promptInput.value = item.prompt;
      promptInput.addEventListener("change", async () => {
        this.plugin.settings.customQuickActions[i]!.prompt = promptInput.value;
        await this.plugin.saveSettings();
      });
      const remove = row.createEl("button", { text: "删除", cls: "mod-warning" });
      remove.addEventListener("click", async () => {
        this.plugin.settings.customQuickActions.splice(i, 1);
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }
}
