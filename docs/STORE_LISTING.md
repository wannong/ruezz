# Ruezz（瑞知）— Microsoft Store 产品说明

可直接复制到 Partner Center「商店列表」对应语言字段。  
Privacy policy: https://github.com/wannong/ruezz/blob/store/msix/PRIVACY.md

---

## 简体中文（zh-CN）

### 简短说明（建议 ≤ 100 字）

面向科研文献的本地知识库 Agent：文献归档、可浏览 Wiki、提问与便签式 Idea，数据留在你指定的文件夹。

### 完整说明

Ruezz（瑞知）是一款面向科研阅读与长期积累的本地知识库 Agent。

在 AI 时代，真正稀缺的往往不是模型能力，而是你自己的 idea。Ruezz 在「提问 / 入库 / 浏览」之外，把便签式 Idea、检索与回看做成一等公民——读文献时随手钉住想法，之后还能找回来。

**主要能力**

- **文献库**：借鉴 Zotero 思路，原件归档、按库组织；支持拖入 Markdown、PDF、Word 等
- **LLM Wiki**：原件进入 raw/，可读页面进入 wiki/，索引可重建
- **Agent**：基于本地库提问、浏览，并支持后续「内化」整理概念页
- **Idea**：在知识页、PDF 与 Agent 回复上做便签批注；可折叠、统一显隐，并支持检索与回看

导入会整篇归档为文献页，不会在导入时自动拆概念；「内化」是你主动让 Agent 做的后续步骤。

**使用方式**

1. 安装后选择一个文件夹作为知识库  
2. 在设置中填入你自己的 OpenAI 兼容 API 地址与密钥  
3. 拖入文献、提问、做 Idea 批注

**请注意**

- 客户端开源免费；对话与内化需自行接入大模型 API，费用由服务商收取  
- 不是云端团队 Agent 平台；数据保存在你选择的本地目录  
- 不必安装 Obsidian 或 Claude Code CLI 也能使用  
- 系统要求：64 位 Windows 10 或 11  

**隐私**  
详见应用内「设置 → 隐私政策」，或访问：  
https://github.com/wannong/ruezz/blob/store/msix/PRIVACY.md

### 功能要点（可选 Features 列表）

- 本地文献知识库与 Wiki 管理  
- 拖入 Markdown / PDF / Word  
- 基于本地库的 Agent 对话  
- 便签式 Idea 批注与检索  
- 自带运行环境，无需另行安装 Node / Python / Git  
- 自备 OpenAI 兼容 API（BYOK）

---

## English (en-US)

### Short description (recommended ≤ ~200 characters)

A local research knowledge-base agent for literature: archive papers, browse a wiki, ask questions, and pin Idea notes—your files stay in a folder you choose.

### Full description

Ruezz is a local knowledge-base agent built for research reading and long-term accumulation.

In the AI era, what is scarce is often not model power, but **your own ideas**. Beyond ask / import / browse, Ruezz treats sticky Idea notes, search, and revisit as first-class: pin thoughts while you read, and find them again later.

**What you get**

- **Literature library**: Zotero-inspired archiving and organization; drag in Markdown, PDF, Word, and more  
- **LLM Wiki**: originals in `raw/`, readable pages in `wiki/`, with rebuildable indexes  
- **Agent**: ask and browse against your local vault; optionally “internalize” into concept pages  
- **Idea notes**: sticky annotations on wiki pages, PDFs, and agent replies—collapsible, hideable, searchable  

Imports archive each document as a literature page; concepts are **not** auto-split on import. Internalization is an explicit step you ask the agent to do.

**Getting started**

1. Pick a folder as your vault after install  
2. Add your own OpenAI-compatible API base URL and key in Settings  
3. Drag in papers, ask questions, and pin Idea notes  

**Please note**

- The desktop client is free and open source; LLM usage requires your own API and is billed by your provider  
- Not a cloud team agent platform—data stays in the local folder you choose  
- No need for Obsidian or Claude Code CLI  
- Requires 64-bit Windows 10 or 11  

**Privacy**  
See Settings → Privacy Policy, or:  
https://github.com/wannong/ruezz/blob/store/msix/PRIVACY.md

### Feature bullets (optional)

- Local literature vault and wiki workflow  
- Drag-and-drop Markdown / PDF / Word  
- Agent chat grounded in your local library  
- Sticky Idea annotations with search  
- Bundled runtime—no separate Node / Python / Git install  
- Bring your own OpenAI-compatible API (BYOK)

---

## Partner Center 填写提示

| 字段 | 用哪一段 |
|------|----------|
| 说明 / Description | 「完整说明」 |
| 简短说明 / Short description（若有） | 「简短说明」 |
| 功能 / Features（若有） | 见 `docs/STORE_FEATURES.md`（完整 12 条或精简 6 条） |
| 隐私策略 URL | 上文 Privacy 链接 |
| 产品类别建议 | 效率 / Productivity（或参考类），勿选新闻/教育（除非你另有定位） |
