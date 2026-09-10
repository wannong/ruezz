# WikiHome Agent Harness 对接说明

本文档说明 WikiHome 本地知识库 Agent harness 的设计和使用方式，供前端界面开发者参考。

## 概述

WikiHome Agent 基于 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`，实现了面向本地 wiki 的工具循环：

- **Session 模型**：每个会话持久化到 `.wikihome/sessions/<session-id>.json`，包含标题、消息历史、链接的页面、模型配置
- **工具循环**：Agent 通过 WikiEngine 工具（search、read、write、create 等）访问知识库，而非直接文件操作
- **上下文注入**：每轮自动注入当前页面 + N 跳邻居 + 检索结果
- **多供应商支持**：可切换 OpenAI、Anthropic 等模型（基于现有 settings.json 的 apiBaseUrl/apiKey）

## RPC 方法

Sidecar 提供以下 JSON-RPC 方法（在 `packages/sidecar/src/server.ts` 中实现）：

### 1. `agent_session_list`

列出所有会话（按 `updatedAt` 降序）。

**参数**：无

**返回**：
```json
{
  "sessions": [
    {
      "id": "sess_abc123_xyz",
      "title": "讨论 attention 机制",
      "createdAt": "2025-01-08T10:00:00.000Z",
      "updatedAt": "2025-01-08T10:15:00.000Z",
      "model": {
        "provider": "openai",
        "modelId": "gpt-4o-mini"
      },
      "messageCount": 4,
      "linkedPageIds": ["concepts/attention", "papers/transformer"]
    }
  ]
}
```

### 2. `agent_session_create`

创建新会话。

**参数**：
```json
{
  "title": "新对话",  // 可选，默认 "新对话"
  "currentPageId": "concepts/attention",  // 可选，当前打开的页面
  "model": {  // 可选，默认 openai/gpt-4o-mini
    "provider": "openai",
    "modelId": "gpt-4o-mini"
  }
}
```

**返回**：
```json
{
  "session": {
    "id": "sess_abc123_xyz",
    "title": "新对话",
    "createdAt": "2025-01-08T10:00:00.000Z",
    "updatedAt": "2025-01-08T10:00:00.000Z",
    "model": { "provider": "openai", "modelId": "gpt-4o-mini" },
    "linkedPageIds": ["concepts/attention"],
    "messages": []
  }
}
```

### 3. `agent_session_get`

获取会话详情（包含完整消息历史）。

**参数**：
```json
{
  "id": "sess_abc123_xyz"  // 或 "sessionId"
}
```

**返回**：
```json
{
  "session": {
    "id": "sess_abc123_xyz",
    "title": "讨论 attention 机制",
    "createdAt": "2025-01-08T10:00:00.000Z",
    "updatedAt": "2025-01-08T10:15:00.000Z",
    "model": { "provider": "openai", "modelId": "gpt-4o-mini" },
    "linkedPageIds": ["concepts/attention", "papers/transformer"],
    "messages": [
      {
        "role": "user",
        "content": "什么是 attention？",
        "timestamp": 1704708000000
      },
      {
        "role": "assistant",
        "content": "根据 [[concepts/attention]]，attention 是...",
        "timestamp": 1704708015000,
        "provider": "openai",
        "model": "gpt-4o-mini",
        "sources": ["concepts/attention"]
      }
    ]
  }
}
```

### 4. `agent_session_delete`

删除会话。

**参数**：
```json
{
  "id": "sess_abc123_xyz"  // 或 "sessionId"
}
```

**返回**：
```json
{
  "ok": true
}
```

### 5. `agent_prompt`

在会话中发送消息，Agent 执行工具循环并返回结果。

**参数**：
```json
{
  "sessionId": "sess_abc123_xyz",
  "message": "列出所有关于 transformer 的页面",  // 或 "question"
  "currentPageId": "concepts/attention",  // 可选，当前打开的页面
  "graphDepth": 1  // 可选，邻居跳数（默认 1，最多 3）
}
```

**返回**：
```json
{
  "answer": "找到以下页面：\n- [[papers/attention-is-all-you-need]]\n- [[concepts/transformer]]",
  "sources": ["papers/attention-is-all-you-need", "concepts/transformer"],
  "linkedPageIds": ["concepts/attention", "papers/attention-is-all-you-need", "concepts/transformer"],
  "toolsUsed": ["search_pages", "read_page"],
  "session": {
    "id": "sess_abc123_xyz",
    "title": "讨论 attention 机制",
    "createdAt": "...",
    "updatedAt": "...",
    "model": { "provider": "openai", "modelId": "gpt-4o-mini" },
    "linkedPageIds": ["concepts/attention", "papers/attention-is-all-you-need", "concepts/transformer"],
    "messages": [...]
  }
}
```

### 6. `agent_set_model`

切换会话的模型。

**参数**：
```json
{
  "sessionId": "sess_abc123_xyz",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022"  // 或 "modelId"
}
```

**返回**：
```json
{
  "session": {
    "id": "sess_abc123_xyz",
    "model": { "provider": "anthropic", "modelId": "claude-3-5-sonnet-20241022" },
    ...
  }
}
```

### 7. `agent_list_providers`

列出可用的模型供应商和模型。

**参数**：无

**返回**：
```json
{
  "providers": [
    {
      "name": "openai",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
    },
    {
      "name": "anthropic",
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    },
    {
      "name": "openai-compatible",
      "models": ["custom-model"]
    }
  ]
}
```

## Session 文件格式

会话落盘在 `<vault>/.wikihome/sessions/<session-id>.json`：

```json
{
  "id": "sess_abc123_xyz",
  "title": "讨论 attention 机制",
  "createdAt": "2025-01-08T10:00:00.000Z",
  "updatedAt": "2025-01-08T10:15:00.000Z",
  "model": {
    "provider": "openai",
    "modelId": "gpt-4o-mini"
  },
  "linkedPageIds": ["concepts/attention", "papers/transformer"],
  "messages": [
    {
      "role": "user",
      "content": "什么是 attention？",
      "timestamp": 1704708000000
    },
    {
      "role": "assistant",
      "content": "根据 [[concepts/attention]]...",
      "timestamp": 1704708015000,
      "provider": "openai",
      "model": "gpt-4o-mini",
      "sources": ["concepts/attention"]
    }
  ]
}
```

## Agent 工具

Agent 可使用以下工具（封装 WikiEngine，见 `packages/agent/src/tools/`）：

- `search_pages(query)`：搜索页面
- `read_page(id)`：读取页面内容
- `write_page(id, content)`：写入/更新页面（必须在 `wiki/` 内）
- `create_page(id, title?)`：创建新页面（必须在 `wiki/` 内）
- `list_pages()`：列出所有页面
- `get_graph()`：获取知识图谱
- `get_backlinks(pageId)`：获取反向链接
- `ingest_text(title, text)`：入库文本
- `ingest_file(filePath)`：入库文件（必须在 `raw/sources/` 内）

工具执行受 WikiEngine 路径守卫保护，禁止写入 `wiki/` 外或读取任意文件。

## 前端对接步骤

1. **启动时加载会话列表**
   ```typescript
   const { sessions } = await invoke("agent_session_list");
   ```

2. **创建新会话**（用户点击"新建对话"）
   ```typescript
   const { session } = await invoke("agent_session_create", {
     title: "新对话",
     currentPageId: currentPage?.id,
   });
   ```

3. **加载会话历史**（用户点击某个会话）
   ```typescript
   const { session } = await invoke("agent_session_get", { id: sessionId });
   // 渲染 session.messages
   ```

4. **发送消息**（用户输入并提交）
   ```typescript
   const result = await invoke("agent_prompt", {
     sessionId: currentSessionId,
     message: userInput,
     currentPageId: currentPage?.id,
     graphDepth: 1,
   });
   // 追加 result.answer 到聊天界面
   // 显示 result.linkedPageIds 作为"相关页面"
   // 显示 result.toolsUsed 作为"使用的工具"（可选）
   ```

5. **切换模型**（用户在设置中选择）
   ```typescript
   const { session } = await invoke("agent_set_model", {
     sessionId: currentSessionId,
     provider: "anthropic",
     model: "claude-3-5-sonnet-20241022",
   });
   ```

## UI 建议

- **会话列表**：按 `updatedAt` 降序显示，每项显示 `title`、`messageCount`、时间
- **聊天界面**：渲染 `session.messages`，识别 `[[page-id]]` 并渲染为可点击链接
- **相关页面**：显示 `linkedPageIds`（可点击跳转）
- **工具使用**：可选显示 `toolsUsed`（如"使用了 search_pages, read_page"）
- **模型切换**：下拉菜单选择 `agent_list_providers` 返回的模型

## 与现有 `vault_ask` 的关系

- **保留**：`vault_ask` 仍可用，作为简单问答（不保存历史）
- **新路径**：`agent_prompt` 是主要交互方式，支持多轮、工具循环、持久化
- **迁移**：前端可先实现 `agent_prompt`，后续移除 `vault_ask` 调用

## 测试

运行 `pnpm smoke` 会测试：
1. Session 创建、列表、获取、删除
2. Agent prompt 执行（触发工具循环）
3. Session 落盘和重启后加载

## 后续优化

- [ ] 流式响应：`agent_prompt_stream`（通过 Tauri event channel）
- [ ] 会话分支：fork session（类似 Pi harness 的 tree navigation）
- [ ] 上下文压缩：自动 compaction（消息超过 token 预算时）
- [ ] 模型动态配置：支持 Anthropic、LM Studio 等多端点
- [ ] 会话搜索：按内容、页面、时间范围过滤

## 文件清单

- `packages/agent/src/types.ts` - Session 类型定义
- `packages/agent/src/session-storage.ts` - Session 落盘逻辑
- `packages/agent/src/agent-runner.ts` - Pi Agent 循环封装
- `packages/agent/src/context-builder.ts` - 上下文构建（当前页 + N 跳）
- `packages/agent/src/tools/` - WikiEngine 工具封装
- `packages/sidecar/src/server.ts` - RPC 方法扩展
- `packages/sidecar/src/smoke.ts` - 集成测试

---

如有问题，请查看代码注释或提 issue。
