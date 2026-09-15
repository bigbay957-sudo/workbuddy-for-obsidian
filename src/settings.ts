import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type WorkBuddyPlugin from "./main";
import { resolveWorkBuddyExecutable } from "./core/workbuddy-client";
import { applyBodyFontFamily, applyBodyFontSize, applyThoughtFontSize } from "./ui/display-settings";

/**
 * 声明式控件里属于「数值」的设置项。
 *
 * 下拉框控件的取值统一是 string，写回 settings 前必须收敛回 number，
 * 否则 data.json 里会存成 "13"，后续比较（如 `=== 16`）或算术都会悄悄出错。
 */
const NUMBER_SETTING_KEYS = new Set(["bodyFontSize", "thoughtFontSize", "maxContextChars"]);

/**
 * WorkBuddy 设置面板。
 *
 * 使用 Obsidian 1.13.0 起的声明式设置 API（getSettingDefinitions）。
 * 它同时负责渲染与设置搜索索引，因此不再实现 display()（已弃用且会被绕过）。
 */
export class WorkBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WorkBuddyPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "WorkBuddy AI",
        desc: "插件通过本机 codebuddy --acp 私有进程连接，不开放端口，也不保存模型 API key。"
      },
      {
        name: "WorkBuddy CLI 路径",
        desc: "留空自动检测。当前机器通常为 ~/.local/bin/codebuddy。",
        control: { key: "cliPath", type: "text", placeholder: "自动检测" }
      },
      {
        name: "检测 WorkBuddy CLI",
        desc: "按上面的路径（留空则自动搜索）确认 codebuddy 是否可用，结果以通知形式提示。",
        action: () => {
          const resolved = resolveWorkBuddyExecutable(this.plugin.settings.cliPath);
          new Notice(resolved ? `已找到：${resolved}` : "未找到 codebuddy，请检查安装或填写完整路径。", 6_000);
        }
      },
      {
        name: "模型",
        desc: "留空使用 WorkBuddy 默认模型；填写模型 ID 后仅影响新连接。",
        control: { key: "model", type: "text", placeholder: "default-model" }
      },
      {
        name: "主题色",
        desc: "侧边栏主色调，立即生效并保留。",
        control: { key: "themeColor", type: "color" }
      },
      {
        name: "权限模式",
        desc: "默认 bypassPermissions（最大权限，CLI 不再逐项询问）。修改后重新连接生效。",
        control: {
          key: "permissionMode",
          type: "dropdown",
          options: {
            bypassPermissions: "最大权限：全部放行（默认）",
            default: "默认：逐项确认",
            acceptEdits: "接受编辑，其它操作确认",
            plan: "计划：只读",
            dontAsk: "不询问：拒绝需要确认的操作",
            auto: "WorkBuddy 自动模式"
          }
        }
      },
      {
        name: "自动批准权限请求",
        desc: "开启后，若 CLI 仍发起权限询问，插件直接选择「允许」，不再弹出选择窗口。",
        control: { key: "autoApprovePermissions", type: "toggle" }
      },
      {
        name: "回答正文字号",
        desc: "侧边栏里 AI 回答正文的字号。默认 13px，比 Obsidian 编辑器正文小一号，接近主流互联网产品的观感。",
        control: {
          key: "bodyFontSize",
          type: "dropdown",
          options: {
            "11": "11px（极小）",
            "12": "12px（很小）",
            "13": "13px（默认）",
            "14": "14px（标准）",
            "15": "15px（偏大）",
            "16": "16px（同 Obsidian 正文）"
          }
        }
      },
      {
        name: "回答正文字体",
        desc: "默认使用无衬线字体栈（SF Pro / Inter + 苹方），并按 antialiased 渲染让字形更纤细；也可跟随 Obsidian 主题字体。",
        control: {
          key: "bodyFontFamily",
          type: "dropdown",
          options: { sans: "无衬线（默认）", theme: "跟随 Obsidian 主题" }
        }
      },
      {
        name: "思考内容字号",
        desc: "侧边栏「思考过程」折叠块的字号，默认 11px，立即生效。",
        control: {
          key: "thoughtFontSize",
          type: "dropdown",
          options: {
            "9": "9px（极小）",
            "10": "10px（很小）",
            "11": "11px（默认）",
            "12": "12px（原大小）",
            "13": "13px（偏大）",
            "14": "14px（大）"
          }
        }
      },
      {
        name: "思考过程默认展开",
        desc: "开启后「思考过程」块默认展开显示，不用每次手点。内容超过 180px 高时在块内滚动，不会挤占回答。改为关闭后，新出现的思考块恢复为默认折叠（已渲染的块保持原状）。",
        control: { key: "thoughtExpanded", type: "toggle" }
      },
      {
        name: "思考过程语言",
        desc: "让模型用简体中文输出「思考过程」。部分模型默认用英文推理（读取英文文件/命令输出时更明显），此项通过提示词约束其改用中文；若模型仍坚持英文，可换用对中文推理更友好的模型。",
        control: {
          key: "thoughtLanguage",
          type: "dropdown",
          options: { zh: "简体中文（默认）", model: "跟随模型默认" }
        }
      },
      {
        name: "自动附加当前笔记",
        desc: "发送时把当前 Markdown 笔记作为参考资料。",
        control: { key: "autoAttachActiveNote", type: "toggle" }
      },
      {
        name: "优先附加选区",
        desc: "编辑器中有选区时，只附加选区而不是整篇笔记。",
        control: { key: "autoAttachSelection", type: "toggle" }
      },
      {
        name: "上下文字符上限",
        desc: "所有附加笔记合计的最大字符数，避免一次发送过多内容。可填 1000 ~ 200000。",
        control: {
          key: "maxContextChars",
          type: "text",
          validate: (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) return "请填写数字";
            if (parsed < 1_000 || parsed > 200_000) return "请填写 1000 ~ 200000 之间的数字";
          }
        }
      },
      {
        name: "显示工具调用",
        desc: "关闭后只保留思考过程和最终回答，隐藏命令、文件读写等工具调用详情。",
        control: { key: "showToolCalls", type: "toggle" }
      },
      {
        name: "常驻指令",
        desc: "对所有对话生效的人设或要求；可通过侧边栏右上角设置菜单或输入框 # 编辑。留空则不附加。",
        control: {
          key: "systemPrompt",
          type: "textarea",
          placeholder: "例如：回答简洁、优先用表格、中文输出…",
          rows: 6
        }
      },
      {
        name: "自定义快捷指令",
        desc: "在侧边栏右下角“快捷”面板中显示；点击后会把提示词与当前选区一起发送给 WorkBuddy。",
        render: (setting: Setting) => {
          // 这一块是自由布局（每行两个输入框 + 删除按钮），声明式控件表达不了，
          // 因此用 render 逃生舱，并加类名让整行横铺。
          setting.setClass("workbuddy-settings-stacked");
          this.renderQuickActionsSettings(setting.settingEl);
        }
      }
    ];
  }

  /** 声明式控件读值：统一从插件自己的 settings 取。 */
  getControlValue(key: string): unknown {
    return this.readStore()[key];
  }

  /** 声明式控件写值：落到 settings 后立即生效并持久化。 */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const store = this.readStore();
    if (NUMBER_SETTING_KEYS.has(key) && typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return;
      store[key] = parsed;
    } else {
      store[key] = value;
    }
    this.applyImmediateEffects(key);
    await this.plugin.saveSettings();
  }

  /**
   * settings 是强类型接口，而声明式控件回调只给 string / boolean /
   * HexString，类型无法在签名上对齐，这里统一用索引写入收敛。
   */
  private readStore(): Record<string, unknown> {
    return this.plugin.settings as unknown as Record<string, unknown>;
  }

  /** 字号 / 字体类设置要立刻反映到侧边栏，不能等插件重载。 */
  private applyImmediateEffects(key: string): void {
    const settings = this.plugin.settings;
    if (key === "bodyFontSize") applyBodyFontSize(settings.bodyFontSize);
    else if (key === "bodyFontFamily") applyBodyFontFamily(settings.bodyFontFamily);
    else if (key === "thoughtFontSize") applyThoughtFontSize(settings.thoughtFontSize);
  }

  private renderQuickActionsSettings(parent: HTMLElement): void {
    parent.empty();
    const actions = this.plugin.settings.customQuickActions;
    if (actions.length === 0) {
      parent.createEl("p", {
        text: "暂无自定义指令。点击下方“添加”创建，或使用内置指令。",
        cls: "setting-item-description"
      });
    }
    for (let index = 0; index < actions.length; index++) {
      const item = actions[index];
      if (!item) continue;
      const row = parent.createDiv({ cls: "workbuddy-quick-action-row" });
      const nameInput = row.createEl("input", {
        cls: "workbuddy-quick-action-name",
        type: "text",
        value: item.name,
        attr: { placeholder: "名称（面板中显示）" }
      });
      // 事件处理器必须「返回 void」：直接把 async 函数塞进去会让 Promise 无处安放
      //（审核 lint 的 no-misused-promises）。统一改成 `() => void fn()`。
      const commitName = async (): Promise<void> => {
        const target = this.plugin.settings.customQuickActions[index];
        if (!target) return;
        target.name = nameInput.value;
        await this.plugin.saveSettings();
      };
      nameInput.addEventListener("change", () => void commitName());

      const promptInput = row.createEl("textarea", {
        cls: "workbuddy-quick-action-prompt",
        attr: { placeholder: "提示词（会与选区一起发送）", rows: "3" }
      });
      promptInput.value = item.prompt;
      const commitPrompt = async (): Promise<void> => {
        const target = this.plugin.settings.customQuickActions[index];
        if (!target) return;
        target.prompt = promptInput.value;
        await this.plugin.saveSettings();
      };
      promptInput.addEventListener("change", () => void commitPrompt());

      const remove = row.createEl("button", { text: "删除", cls: "mod-warning" });
      const removeAction = async (): Promise<void> => {
        this.plugin.settings.customQuickActions.splice(index, 1);
        await this.plugin.saveSettings();
        // 条目增减改变了定义结构，用 update() 重建（refreshDomState 只够切换显隐）
        this.update();
      };
      remove.addEventListener("click", () => void removeAction());
    }

    const add = parent.createEl("button", { text: "添加自定义快捷指令" });
    const addAction = async (): Promise<void> => {
      this.plugin.settings.customQuickActions.push({ name: "新指令", prompt: "" });
      await this.plugin.saveSettings();
      this.update();
    };
    add.addEventListener("click", () => void addAction());
  }
}
