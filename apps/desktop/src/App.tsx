import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type PageContent, type PageSummary, type VaultSettings } from "./api";

type Screen = "onboarding" | "main";

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
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [ingestNote, setIngestNote] = useState("");
  const [pasteTitle, setPasteTitle] = useState("剪贴笔记");
  const [pasteBody, setPasteBody] = useState("");
  const [dragOver, setDragOver] = useState(false);

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
      setIngestNote(`已入库 ${paths.length} 个文件`);
      await loadPages();
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
      setIngestNote("已入库粘贴文本");
      await loadPages();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.vaultAsk(question);
      setAnswer(res.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (screen === "onboarding") {
    return (
      <div className="app-shell">
        <h1 className="brand">WikiHome</h1>
        <p className="lead">三步开始：选文件夹、填模型、丢进第一份资料。</p>
        <div className="card grid-form">
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
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value, mock: !e.target.value })}
              placeholder="留空则使用本地 mock（仅演示）"
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
            使用 Mock LLM（离线冒烟）
          </label>
          <div className="row">
            <button className="primary" type="button" disabled={!canStart || busy} onClick={start}>
              {busy ? "创建中…" : "创建并进入"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 className="brand">WikiHome</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            {settings.vaultPath}
          </p>
        </div>
        <button type="button" onClick={() => setScreen("onboarding")}>
          设置
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="panel-title">入库</h2>
        <div
          className={`dropzone ${dragOver ? "active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            setError("桌面版请用「选择文件」入库（浏览器拖拽路径受限）。");
          }}
        >
          将 Markdown 放进知识库，或点击选择文件
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const files = await api.pickFiles();
              await ingestFiles(files);
            }}
          >
            选择文件…
          </button>
          {ingestNote && <span style={{ color: "var(--muted)" }}>{ingestNote}</span>}
        </div>
        <div className="grid-form" style={{ marginTop: "1rem" }}>
          <label className="label">
            粘贴标题
            <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
          </label>
          <label className="label">
            粘贴正文
            <textarea rows={4} value={pasteBody} onChange={(e) => setPasteBody(e.target.value)} />
          </label>
          <button className="primary" type="button" disabled={busy || !pasteBody.trim()} onClick={ingestPaste}>
            入库文本
          </button>
        </div>
      </div>

      <div className="main-layout">
        <section className="card">
          <h2 className="panel-title">页面</h2>
          <ul className="page-list">
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={activeId === p.id ? "active" : ""}
                  onClick={() => setActiveId(p.id)}
                >
                  {p.title ?? p.id}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="panel-title">阅读</h2>
          <div className="reader">{page?.raw ?? "选择左侧页面查看内容"}</div>
        </section>

        <section className="card chat">
          <h2 className="panel-title">提问</h2>
          <textarea
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：这份资料的核心观点是什么？"
          />
          <button className="primary" type="button" disabled={busy || !question.trim()} onClick={ask}>
            {busy ? "思考中…" : "提问"}
          </button>
          {answer && <div className="bubble">{answer}</div>}
        </section>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
