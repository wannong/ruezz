import { useCallback, useEffect, useState } from "react";
import { api, type VaultSettings } from "./api";
import { Onboarding } from "./components/Onboarding";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { vaultName } from "./lib/fileTree";
import { hydrateProviders } from "./lib/llmProviders";
import { applyTheme, loadTheme, type Theme } from "./theme";

const defaultSettings: VaultSettings = {
  vaultPath: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  mock: false,
  providers: [],
  activeProviderId: "",
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [screen, setScreen] = useState<"onboarding" | "main">("onboarding");
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentTitle, setAgentTitle] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.settingsGet();
        if (cancelled) return;
        setSettings(hydrateProviders(s));
        if (!s.vaultPath) return;
        await api.vaultInit(s.vaultPath);
        if (!cancelled) setScreen("main");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setScreen("onboarding");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  async function openVaultAt(root: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.settingsSet({ ...settings, vaultPath: root, mock: false });
      await api.vaultInit(root);
      setSettings(next);
      setScreen("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScreen("onboarding");
    } finally {
      setBusy(false);
    }
  }

  async function chooseVault(kind: "new" | "open") {
    const title = kind === "new" ? "新建知识库：选择或新建文件夹" : "打开知识库";
    const folder = await api.pickFolder(title);
    if (!folder) return;
    await openVaultAt(folder);
  }

  async function start() {
    if (!settings.vaultPath.trim()) return;
    await openVaultAt(settings.vaultPath.trim());
  }

  async function revealVault() {
    if (!settings.vaultPath) return;
    try {
      await api.vaultReveal({ kind: "root" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app-shell">
      <TitleBar
        label={settings.vaultPath ? vaultName(settings.vaultPath) : "WikiHome"}
        sessionTitle={screen === "main" ? agentTitle : null}
        hasVault={Boolean(settings.vaultPath)}
        onNewVault={() => void chooseVault("new")}
        onOpenVault={() => void chooseVault("open")}
        onRevealVault={() => void revealVault()}
      />
      <div className="app-shell-body">
        {screen === "onboarding" ? (
          <Onboarding
            settings={settings}
            onChange={setSettings}
            busy={busy}
            error={error}
            onStart={() => void start()}
          />
        ) : (
          <Workspace
            key={settings.vaultPath}
            settings={settings}
            onSettings={setSettings}
            theme={theme}
            onToggleTheme={toggleTheme}
            error={error}
            setError={setError}
            busy={busy}
            setBusy={setBusy}
            onAgentTitle={setAgentTitle}
          />
        )}
      </div>
    </div>
  );
}
