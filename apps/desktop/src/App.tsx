import { useCallback, useEffect, useState } from "react";
import { api, type VaultSettings } from "./api";
import { BootSplash } from "./components/BootSplash";
import { Onboarding } from "./components/Onboarding";
import { vaultName } from "./lib/fileTree";
import { TitleBar, type TitleBarCentaurProps } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { hydrateProviders } from "./lib/llmProviders";
import {
  applyPalette,
  cyclePalette,
  loadPalette,
  paletteGraphTheme,
  type ColorPalette,
} from "./theme";

const defaultSettings: VaultSettings = {
  vaultPath: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  mock: false,
  providers: [],
  activeProviderId: "",
  ideaColor: "white",
  ideaOpacity: 0.92,
};

export default function App() {
  const [palette, setPalette] = useState<ColorPalette>(() => loadPalette());
  const graphTheme = paletteGraphTheme(palette);
  const [screen, setScreen] = useState<"booting" | "onboarding" | "main">("booting");
  const [settings, setSettings] = useState<VaultSettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentTitle, setAgentTitle] = useState<string | null>(null);
  const [titleBarCentaur, setTitleBarCentaur] = useState<TitleBarCentaurProps | null>(null);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.settingsGet();
        if (cancelled) return;
        setSettings(hydrateProviders(s));
        if (!s.vaultPath) {
          setScreen("onboarding");
          return;
        }
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

  const onPaletteChange = useCallback((next: ColorPalette) => {
    setPalette(next);
    applyPalette(next);
  }, []);

  const cycleColorPalette = useCallback(() => {
    setPalette((current) => {
      const next = cyclePalette(current);
      applyPalette(next);
      return next;
    });
  }, []);

  async function openVaultAt(root: string) {
    setBusy(true);
    setError(null);
    setScreen("booting");
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
        label={settings.vaultPath ? vaultName(settings.vaultPath) : "Ruezz"}
        sessionTitle={screen === "main" ? agentTitle : null}
        hasVault={Boolean(settings.vaultPath)}
        centaur={screen === "main" ? titleBarCentaur : null}
        onNewVault={() => void chooseVault("new")}
        onOpenVault={() => void chooseVault("open")}
        onRevealVault={() => void revealVault()}
      />
      <div className="app-shell-body">
        {screen === "onboarding" ? (
          <Onboarding
            settings={settings}
            onChange={setSettings}
            palette={palette}
            onPaletteChange={onPaletteChange}
            busy={busy}
            error={error}
            onStart={() => void start()}
          />
        ) : (
          <Workspace
            key={settings.vaultPath}
            settings={settings}
            onSettings={setSettings}
            colorPalette={palette}
            graphTheme={graphTheme}
            onColorPaletteChange={onPaletteChange}
            onCycleColorPalette={cycleColorPalette}
            error={error}
            setError={setError}
            busy={busy}
            setBusy={setBusy}
            onAgentTitle={setAgentTitle}
            onTitleBarCentaur={setTitleBarCentaur}
          />
        )}
      </div>
      {screen === "booting" && (
        <BootSplash
          overlay
          animate
          caption="Ruezz 正在启动…"
          subtitle={settings.vaultPath ? vaultName(settings.vaultPath) : undefined}
        />
      )}
    </div>
  );
}
