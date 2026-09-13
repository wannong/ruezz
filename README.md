# WikiHome

本地知识库管理 Agent：拖入 Markdown / PDF / Word → 整篇归档进 wiki → 提问与浏览。

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
$env:WIKIHOME_MOCK="1"; $env:WIKIHOME_HTTP_TOKEN="replace-with-at-least-24-random-characters"; node packages/sidecar/dist/http-main.js   # 终端 1
# 终端 2：
cd apps/desktop
$env:VITE_SIDECAR_HTTP="http://127.0.0.1:8787"
$env:VITE_SIDECAR_HTTP_TOKEN="replace-with-at-least-24-random-characters"
pnpm dev
```

打开 http://localhost:1420

### Tauri 桌面 / 独立 exe

给完全没有开发环境的电脑用 **安装包**：

1. 把 `release/WikiHome_*_x64-setup.exe` 拷到那台电脑
2. 双击安装，一直点「下一步」
3. 开始菜单或桌面打开 WikiHome

安装包已内置 Node 引擎、PDF/Office 转换（MarkItDown）和 WebView2 运行时。不需要再装 Node、Python、Git，也不要求系统事先装过 WebView2。默认装到当前用户目录，不用管理员权限。

开发机本地验收仍可用绿色目录 `release/`：

- `WikiHome.exe`
- `WebView2Loader.dll`（GNU 工具链必需，运行 `pnpm release:prepare` 自动复制）
- `启动WikiHome.bat`

```bash
pnpm dev:desktop
pnpm --filter @wikihome/desktop tauri build
pnpm release:prepare
```

生成安装包前会暂存运行时到 `apps/desktop/src-tauri/resources/`（不进 git）。

## 版本

见 [docs/VERSIONING.md](docs/VERSIONING.md) 与 [CHANGELOG.md](CHANGELOG.md)。
