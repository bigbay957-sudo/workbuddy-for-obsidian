# Security Policy

## Supported versions

安全修复默认面向最新发布版本。报告问题前请先升级到最新 GitHub Release。

## Reporting a vulnerability

请优先使用 GitHub 仓库的 **Private vulnerability reporting**。如果该功能尚未开启，请创建一个不包含密钥、私人笔记内容或可利用细节的普通 Issue，请求维护者建立私密沟通渠道。

请勿在公开 Issue 中提交 WorkBuddy/GitHub/模型服务令牌、真实 Vault 内容、客户资料或完整利用代码。

## Security model

- 插件仅支持 Obsidian 桌面端，因为需要启动本地 WorkBuddy CLI。
- WorkBuddy 使用私有 stdio ACP 子进程，不开放网络监听端口。
- 具有副作用的工具操作继续经过 WorkBuddy 权限流程。
- 插件更新只接受用户配置的 GitHub 仓库，并校验标准三文件、插件 ID 与版本；覆盖前备份当前文件。
- 从电脑上传的文件会复制进 Vault，原文件不会被移动或覆盖。
