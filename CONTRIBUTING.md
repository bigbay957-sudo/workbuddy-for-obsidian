# Contributing

感谢参与 WorkBuddy for Obsidian。

## 开发环境

- Node.js 18+
- npm
- Obsidian 桌面版 1.7.2+
- 已安装并登录的 WorkBuddy CLI（仅真实 ACP 探针需要）

```bash
npm install
npm run verify
```

提交 Pull Request 前请确保：

1. 不提交真实 Vault 内容、`data.json`、访问令牌或机器绝对路径。
2. 新增纯逻辑时补充 Vitest 测试。
3. 界面变化兼容 Obsidian深色/浅色主题，并尽量使用主题变量。
4. 不绕过 WorkBuddy 权限确认。
5. 更新版本时同步修改 `package.json`、`package-lock.json`、`manifest.json`、`versions.json` 与客户端版本。

## Release conventions

- Git 标签不带 `v`，例如 `0.7.2`。
- 标签必须与 `manifest.json` 的版本完全一致。
- Release 必须包含 `main.js`、`manifest.json`、`styles.css` 和安装 ZIP。
