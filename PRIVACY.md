# Privacy

WorkBuddy for Obsidian 是桌面端本地插件。

## 插件会处理的数据

- 用户主动发送的任务文字。
- 当前笔记、选区和用户明确添加的 Vault 资料。
- 用户通过“上传本地文件”复制到 `WorkBuddy/Uploads/` 的文件。
- 为恢复任务而保存在 Obsidian 插件数据中的聊天记录、草稿、资料引用和资料包。

## 数据去向

- 插件通过本机 `codebuddy --acp` 子进程把用户主动发送的内容交给 WorkBuddy。
- 后续网络处理、模型提供方和账号数据政策由用户安装的 WorkBuddy CLI 及其配置决定。
- 插件自身不包含遥测、广告 SDK 或独立分析服务。
- 插件不保存 WorkBuddy 或模型 API Key。

## 用户控制

- 未点击发送时，插件不会把任务交给 WorkBuddy。
- 用户可从任务中移除引用，也可删除 `WorkBuddy/Uploads/` 下的副本。
- 自动恢复数据位于 Obsidian 的插件数据文件中；卸载插件前可自行备份或删除。
- 导出的聊天记录写入 Vault 的 `WorkBuddy/Chats/`，由用户自行管理和同步。

## 第三方服务

本项目不控制 WorkBuddy、模型提供方、GitHub、Obsidian Sync 或用户自行安装的同步工具。请同时阅读这些服务各自的隐私政策。
