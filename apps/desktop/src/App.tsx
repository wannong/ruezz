import { useCallback, useEffect, useState } from "react";
import { api, type VaultSettings } from "./api";
import { Onboarding } from "./components/Onboarding";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { vaultName } from "./lib/fileTree";
import { applyTheme, loadTheme, type Theme } from "./theme";

const defaultSettings: VaultSettings = {
  vaultPath: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  mock: true,
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [screen, setScreen] = useState<"onboarding" | "main">("onboarding");
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.settingsSet(settings);
      await api.vaultInit(settings.vaultPath);
      setScreen("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <TitleBar label={settings.vaultPath ? vaultName(settings.vaultPath) : "WikiHome"} />
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
            settings={settings}
            onSettings={setSettings}
            theme={theme}
            onToggleTheme={toggleTheme}
            error={error}
            setError={setError}
            busy={busy}
            setBusy={setBusy}
          />
        )}
      </div>
    </div>
  );
}
