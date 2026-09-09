import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type PageContent, type PageSummary, type VaultSettings } from "./api";

type Screen = "onboarding" | "main";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

const defaultSettings: VaultSettings = {
  vaultPath: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  mock: true,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState<PageContent | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("剪贴笔记");
  const [pasteBody, setPasteBody] = useState("");

  const loadPages = useCallback(async () => {
    const list = await api.vaultListPages();
    setPages(list);
  }, []);

  useEffect(() => {
    api
      .settingsGet()
      .then((s) => {
        setSettings(s);
        if (s.vaultPath) setScreen("main");
      })
      .catch(() => {
        /* sidecar may not be up yet in pure vite */
      });
  }, []);

  useEffect(() => {
    if (screen !== "main") return;
    loadPages().catch((e) => setError(String(e)));
  }, [screen, loadPages]);

  useEffect(() => {
    if (!activeId) {
      setPage(null);
      return;
    }
    api
      .vaultReadPage(activeId)
      .then(setPage)
      .catch((e) => setError(String(e)));
  }, [activeId]);

  const canStart = useMemo(() => settings.vaultPath.trim().length > 0, [settings.vaultPath]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.settingsSet(settings);
      await api.vaultInit(settings.vaultPath);
      setScreen("main");
      await loadPages();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestFiles(paths: string[]) {
    if (!paths.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const p of paths) {
        await api.vaultIngestPath(p);
      }
      await loadPages();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `已入库 ${paths.length} 个文件`,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestPaste() {
    setBusy(true);
    setError(null);
    try {
      await api.vaultIngestText(pasteTitle, pasteBody);
      setPasteBody("");
      setPasteOpen(false);
      await loadPages();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `已入库文本「${pasteTitle}」`,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const res = await api.vaultAsk(text);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: res.answer },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "system", content: `错误：${msg}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (screen === "onboarding") {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <h1 className="brand">WikiHome</h1>
          <p className="lead">选择知识库文件夹并配置模型后进入工作台。</p>
          <div className="grid-form">
            <label className="label">
              知识库文件夹
              <div className="row">
                <input
                  value={settings.vaultPath}
                  onChange={(e) => setSettings({ ...settings, vaultPath: e.target.value })}
                  placeholder="例如 D:\MyVault"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const folder = await api.pickFolder();
                    if (folder) setSettings({ ...settings, vaultPath: folder });
                  }}
                >
                  浏览…
                </button>
              </div>
            </label>
            <label className="label">
              API Base URL
              <input
                value={settings.apiBaseUrl}
                onChange={(e) => setSettings({ ...settings, apiBaseUrl: e.target.value })}
              />
            </label>
            <label className="label">
              API Key
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) =>
                  setSettings({ ...settings, apiKey: e.target.value, mock: !e.target.value })
                }
                placeholder="留空则使用本地 mock"
              />
            </label>
            <label className="label">
              模型名
              <input
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.mock}
                onChange={(e) => setSettings({ ...settings, mock: e.target.checked })}
              />
              使用 Mock LLM
            </label>
            <button className="primary" type="button" disabled={!canStart || busy} onClick={start}>
              {busy ? "创建中…" : "进入工作台"}
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <strong>WikiHome</strong>
          <span className="path" title={settings.vaultPath}>
            {settings.vaultPath}
          </span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const files = await api.pickFiles();
              await ingestFiles(files);
            }}
          >
            导入文件
          </button>
          <button type="button" onClick={() => setPasteOpen((v) => !v)}>
            粘贴入库
          </button>
          <button type="button" onClick={() => setScreen("onboarding")}>
            设置
          </button>
        </div>
      </header>

      {pasteOpen && (
        <div className="paste-bar">
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="标题"
          />
          <textarea
            rows={2}
            value={pasteBody}
            onChange={(e) => setPasteBody(e.target.value)}
            placeholder="粘贴正文…"
          />
          <button
            className="primary"
            type="button"
            disabled={busy || !pasteBody.trim()}
            onClick={ingestPaste}
          >
            入库
          </button>
        </div>
      )}

      <div className="workspace-frame">
        <aside className="pane pane-files">
          <div className="pane-label">文件目录</div>
          <ul className="file-tree">
            {pages.length === 0 && <li className="empty">暂无页面，先导入或粘贴资料</li>}
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={activeId === p.id ? "active" : ""}
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="file-name">{p.title ?? p.id}</span>
                  {p.type && <span className="file-meta">{p.type}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="pane pane-content">
          <div className="pane-label">文件内容</div>
          <div className="content-body">
            {page ? (
              <>
                <h2 className="content-title">{page.title ?? page.id}</h2>
                <pre className="content-text">{page.raw}</pre>
              </>
            ) : (
              <div className="empty-center">从左侧选择文件查看内容</div>
            )}
          </div>
        </main>

        <aside className="pane pane-agent">
          <div className="agent-dialog">
            <div className="pane-label">agent 对话框</div>
            <div className="message-list">
              {messages.length === 0 && (
                <div className="empty-center subtle">向 Agent 提问，答案会出现在这里</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`msg msg-${m.role}`}>
                  <div className="msg-role">
                    {m.role === "user" ? "你" : m.role === "assistant" ? "Agent" : "系统"}
                  </div>
                  <div className="msg-body">{m.content}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="agent-composer">
            <div className="pane-label">发送消息框</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              rows={3}
              disabled={busy}
            />
            <div className="composer-actions">
              <button
                className="primary"
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void sendMessage()}
              >
                {busy ? "发送中…" : "发送"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {error && <div className="toast-error">{error}</div>}
    </div>
  );
}
