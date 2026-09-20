# Privacy Policy / 隐私政策

**Ruezz（瑞知）**  
Effective date / 生效日期: 2026-09-20  
Last updated / 最后更新: 2026-09-20

This document applies to the Ruezz desktop application for Windows (including builds distributed via GitHub Releases and the Microsoft Store).

本文适用于 Ruezz Windows 桌面应用（含 GitHub Releases 与 Microsoft Store 分发版本）。

Contact / 联系: open an issue at [github.com/wannong/ruezz](https://github.com/wannong/ruezz/issues)

---

## English

### What Ruezz is

Ruezz is a **local** research literature knowledge-base agent. Your vault files stay in folders you choose on your computer. Ruezz does **not** operate a Ruezz cloud account or require you to sign in to us.

### Data we store on your device

Depending on how you use the app, Ruezz may store locally:

- Path to your chosen knowledge-base (vault) folder
- App settings (theme, Idea appearance, literature library organization metadata)
- LLM provider settings you enter: API base URL, API key, selected model IDs
- Agent session history and Idea notes **inside your vault** (or app-local config under `%APPDATA%\Ruezz` / `%LOCALAPPDATA%\Ruezz`)
- Diagnostic logs such as sidecar stderr under `%APPDATA%\Ruezz` when troubleshooting is needed
- Optional WebView2 runtime files under `%LOCALAPPDATA%\Ruezz` if the OS runtime is missing

We do **not** upload your vault documents, Idea notes, or API keys to a Ruezz-operated server, because we do not run one for this product.

### Network activity

Ruezz may connect to the network only when needed for features you use, for example:

- Calling the **third-party LLM API** you configure (OpenAI-compatible endpoints such as OpenAI, DeepSeek, or others you choose)
- Checking for application updates (GitHub Releases builds may contact `github.com/wannong/ruezz`)
- Downloading a user-local WebView2 runtime if your system does not already provide one
- Opening links you click (documentation, support, optional donation QR pages)

Microsoft Store builds are expected to receive app updates through the Store; GitHub-based auto-update may be disabled in Store packages.

### Third parties

- **LLM providers**: When you send a chat or related request, prompt content and necessary context leave your device and go to the API endpoint **you** configured. Those providers process data under **their** privacy policies. Ruezz does not control them.
- **Microsoft**: Store distribution, OS services, and WebView2 follow Microsoft’s policies.
- **GitHub**: Used for open-source hosting and (for non-Store builds) update metadata/binaries.

### Permissions and local access

Ruezz needs access to folders you select (vault / literature files) to import, index, read, and write knowledge-base content. It runs as a normal desktop app and may start bundled helper processes (Node sidecar, embedded Python tools) on your machine to convert documents and run the local agent.

### Children

Ruezz is not directed at children under 13. Do not provide personal information of children through the app.

### Your choices

- You can clear or edit settings and delete vault data on disk at any time.
- You can remove API keys from Settings.
- You can uninstall the app; configuration under `%APPDATA%\Ruezz` may remain until you delete it manually.
- Optional “support / tip” (Afdian) UI only shows information you choose to open; it does not grant us payment-card access inside Ruezz.

### Changes

We may update this policy as the product changes. The “Last updated” date at the top will change. Continued use after an update means you accept the revised policy.

### Contact

Questions about privacy: file an issue at [https://github.com/wannong/ruezz/issues](https://github.com/wannong/ruezz/issues).

---

## 中文

### 产品说明

Ruezz（瑞知）是一款**本地**科研文献知识库 Agent。知识库文件保存在你指定的本机文件夹中。Ruezz **不提供**官方云端账号，也不要求你登录我们的服务器。

### 本机可能保存的数据

按使用情况，应用可能在本地保存：

- 你选择的知识库（vault）路径
- 应用设置（主题、便签外观、文献库组织等）
- 你填写的模型服务配置：API 地址、API Key、模型 ID
- Agent 会话与 Idea 便签等内容（通常位于知识库目录，或 `%APPDATA%\Ruezz` / `%LOCALAPPDATA%\Ruezz`）
- 排障用的日志（例如 `%APPDATA%\Ruezz` 下的 sidecar 日志）
- 若系统缺少 WebView2，可能下载用户级运行时到 `%LOCALAPPDATA%\Ruezz`

我们**不会**把你的文献、Idea 或 API Key 上传到 Ruezz 自有服务器——本产品不运行此类后端。

### 联网行为

仅在实现你启用的功能时联网，例如：

- 访问你配置的**第三方大模型 API**（OpenAI 兼容接口等）
- 检查应用更新（GitHub 发行版可能访问 `github.com/wannong/ruezz`）
- 在系统缺少 WebView2 时下载用户级运行时
- 打开你点击的链接（文档、支持、可选赞赏相关页面）

Microsoft Store 版本预期通过商店更新；商店包中可能关闭基于 GitHub 的应用内自动更新。

### 第三方

- **大模型服务商**：当你发起对话等请求时，提示词与必要上下文会发往**你填写的** API 地址，并适用对方的隐私政策。Ruezz 无法控制这些服务商。
- **Microsoft**：商店分发、系统服务与 WebView2 适用微软相关政策。
- **GitHub**：用于开源托管，以及（非商店版）更新元数据与安装包。

### 本地权限

应用需要访问你选定的文件夹以导入、索引、读写知识库；并可能在本机启动捆绑的辅助进程（Node 引擎、嵌入式 Python 转换工具等）。

### 儿童

本产品不面向 13 岁以下儿童。请勿通过本应用提交儿童的个人信息。

### 你的选择

- 可随时修改或删除本机设置与知识库文件
- 可在设置中清除 API Key
- 卸载后 `%APPDATA%\Ruezz` 中的配置可能仍保留，可手动删除
- 可选的「发电 / 赞赏」入口仅展示你选择打开的信息，不会在应用内收集银行卡号

### 政策变更

产品变更时我们可能更新本政策，并以文首「最后更新」日期为准。继续使用即表示你同意更新后的政策。

### 联系我们

隐私相关问题请在 [https://github.com/wannong/ruezz/issues](https://github.com/wannong/ruezz/issues) 提交 Issue。
