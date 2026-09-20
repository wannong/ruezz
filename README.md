# Ruezz（瑞知）

面向科研文献的本地知识库 Agent。

在 AI 时代，真正稀缺的往往不是模型能力，而是**你自己的 idea**。Ruezz 在常见的「提问 / 入库 / 浏览」之外，把便签式 Idea、检索与回看做成一等公民：读文献时随手钉住想法，之后还能找回来。

免费开源桌面壳；对话与内化需自行接入 OpenAI-compatible API。

**隐私政策**：[PRIVACY.md](./PRIVACY.md)（Microsoft Store / Partner Center 可用）

## 适合谁

- 做科研阅读、文献综述、长期课题积累的人
- 想要「文献原件 + 可浏览 wiki + Agent」在同一处，又不想被 Obsidian / Claude Code CLI 绑死的人
- 需要 Windows 安装包、尽量少折腾环境的人

## 它做什么

| 能力 | 说明 |
|------|------|
| 文献库 | 借鉴 Zotero 思路：原件归档、按库组织；支持 Markdown / PDF / Word 等拖入 |
| LLM Wiki | 采用 LLM Wiki 管理：原件进 `raw/`，可读页面进 `wiki/`，索引可重建 |
| Agent | 基于本地库提问、浏览与后续内化（编译概念页） |
| Idea | 知识页 / PDF / Agent 回复上的便签批注；可折叠、可统一显隐，并支持检索与回看 |

导入会整篇归档为文献页，**不会**在导入时自动拆概念；「内化」是你主动让 Agent 做的后续步骤。

## 和常见工具的关系

- **不必**安装 Obsidian 或 Claude Code CLI 才能用
- **不是**云端团队 Agent 平台；数据在你选的本地知识库目录
- **开源免费**的是客户端与引擎外壳；LLM 费用与可用性取决于你接入的 API

## 快速开始（安装包）

给没有开发环境的电脑：

1. 使用 `release/` 下的 Windows 安装包（`Ruezz_<版本>_x64-setup.exe`）
2. 双击安装，一直点「下一步」（默认装到当前用户目录，一般不需要管理员权限）
3. 首次打开时选择知识库文件夹，在设置里填入 API 地址与密钥
4. 之后可在「设置 → 关于与更新」检查更新（发布到公开仓库 `wannong/ruezz` 后生效）

安装包内置 Node 引擎、PDF/Office 转换（MarkItDown）与 WebView2 相关运行时，一般不必再装 Node / Python / Git。

系统要求：64 位 Windows 10 或 11。

## 开发

- Node.js 20+
- pnpm 9+
- Rust + Cargo（Tauri 桌面）
- 可用的 OpenAI-compatible API（或 `--mock` 冒烟）

```bash
pnpm install
pnpm build
pnpm smoke          # mock LLM 端到端（Node）
```

### 无 Rust 时（Web 模式）

```powershell
pnpm build
$env:WIKIHOME_MOCK="1"; $env:WIKIHOME_HTTP_TOKEN="replace-with-at-least-24-random-characters"; node packages/sidecar/dist/http-main.js   # 终端 1
# 终端 2：
cd apps/desktop
$env:VITE_SIDECAR_HTTP="http://127.0.0.1:8787"
$env:VITE_SIDECAR_HTTP_TOKEN="replace-with-at-least-24-random-characters"
pnpm dev
```

打开 http://localhost:1420

### Tauri 桌面

```bash
pnpm dev:desktop
pnpm --filter @wikihome/desktop tauri build
pnpm release:prepare
```

开发机也可用绿色目录 `release/`（`Centaur.exe`、`WebView2Loader.dll`、`启动Centaur.bat` 等；品牌文件名将随后续版本统一为 Ruezz）。

架构概要：GUI（React）→ Tauri → Node sidecar；引擎经 `@wikihome/engine-api` 接入 vendored `llmwiki-core`，可替换。详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 版本

见 [docs/VERSIONING.md](docs/VERSIONING.md) 与 [CHANGELOG.md](CHANGELOG.md)。

---

**GitHub About 建议文案（可粘贴到仓库 Description）**

> Ruezz（睿智）：科研文献本地知识库 Agent。LLM Wiki + 类 Zotero 原件管理；Idea 便签与检索。开源桌面壳，需自备 API。
