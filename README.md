# WikiHome

本地知识库管理 Agent（MVP）：拖入资料 → AI 编译 wiki → 提问与浏览。

无需 Obsidian / Claude Code CLI。桌面壳为 Tauri；引擎经 `@wikihome/engine-api` 门面接入 vendored `llmwiki-core`，可替换。

## 要求

- Node.js 20+
- pnpm 9+
- Rust + Cargo（Tauri）
- 可用的 OpenAI-compatible API（或 `--mock` 冒烟）

## 开发

```bash
pnpm install
pnpm build
pnpm smoke          # mock LLM 端到端（Node）
```

### 无 Rust 时（Web 模式）

```powershell
pnpm build
$env:WIKIHOME_MOCK="1"; node packages/sidecar/dist/http-main.js   # 终端 1
# 终端 2：
cd apps/desktop
$env:VITE_SIDECAR_HTTP="http://127.0.0.1:8787"
pnpm dev
```

打开 http://localhost:1420

### Tauri 桌面 / 独立 exe

打包后验收目录：`release/`

- `WikiHome.exe`
- `WebView2Loader.dll`（GNU 工具链必需，运行 `pnpm release:prepare` 自动复制）
- `启动WikiHome.bat`

需本机已安装 **Node.js**（sidecar）与 **WebView2 运行时**。

```bash
pnpm dev:desktop
pnpm --filter @wikihome/desktop tauri build
pnpm release:prepare
```

## 版本

见 [docs/VERSIONING.md](docs/VERSIONING.md) 与 [CHANGELOG.md](CHANGELOG.md)。
