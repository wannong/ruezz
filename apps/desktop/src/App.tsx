import { useCallback, useEffect, useState } from "react";
import { api, type VaultSettings } from "./api";
import { Onboarding } from "./components/Onboarding";
import { Workspace } from "./components/Workspace";
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

  if (screen === "onboarding") {
    return (
      <Onboarding
        settings={settings}
        onChange={setSettings}
        busy={busy}
        error={error}
        onStart={() => void start()}
      />
    );
  }

  return (
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
  );
}
