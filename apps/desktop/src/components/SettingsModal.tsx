import { useEffect, useMemo, useState } from "react";
import { Bot, FolderOpen, Info, Palette, SquareDashedBottomCode } from "lucide-react";
import type { VaultSettings } from "../api";
import { hydrateProviders } from "../lib/llmProviders";
import type { ColorPalette } from "../theme";
import {
  AboutSection,
  AppearanceSection,
  DeveloperSection,
  ProvidersSection,
  VaultSection,
} from "./SettingsFields";

type SettingsSectionId = "general" | "appearance" | "providers" | "developer" | "about";

const SECTION_ITEMS: Array<{ id: SettingsSectionId; label: string; icon: typeof FolderOpen }> = [
  { id: "general", label: "通用", icon: FolderOpen },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "providers", label: "模型服务商", icon: Bot },
  { id: "developer", label: "开发者", icon: SquareDashedBottomCode },
  { id: "about", label: "关于", icon: Info },
];

type SettingsModalProps = {
  settings: VaultSettings;
  palette: ColorPalette;
  onPaletteChange: (palette: ColorPalette) => void;
  developerMode: boolean;
  onDeveloperModeChange: (next: boolean) => void;
  onPreviewBootSplash?: () => void;
  busy: boolean;
  onClose: () => void;
  onSave: (next: VaultSettings) => Promise<void>;
};

export function SettingsModal({
  settings,
  palette,
  onPaletteChange,
  developerMode,
  onDeveloperModeChange,
  onPreviewBootSplash,
  busy,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [draft, setDraft] = useState(() => hydrateProviders(settings));
  const [savedDraft, setSavedDraft] = useState(draft);
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft],
  );

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  useEffect(() => {
    if (!confirmClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmClose(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClose]);

  async function save() {
    await onSave(draft);
    // Reached only on success: the parent closes the modal; keep baseline in
    // sync so a brief re-open does not show a phantom dirty state.
    setSavedDraft(draft);
    setConfirmClose(false);
  }

  const sections = SECTION_ITEMS.filter((item) => item.id !== "developer" || onDeveloperModeChange);

  return (
    <div className="modal-backdrop" onClick={requestClose} role="presentation">
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>设置</h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="settings-shell">
          <nav className="settings-nav" aria-label="设置分类">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={15} aria-hidden />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="settings-content">
            <div className="grid-form">
              {section === "general" && <VaultSection settings={draft} onChange={setDraft} />}
              {section === "appearance" && (
                <AppearanceSection settings={draft} onChange={setDraft} palette={palette} onPaletteChange={onPaletteChange} />
              )}
              {section === "providers" && <ProvidersSection settings={draft} onChange={setDraft} />}
              {section === "developer" && onDeveloperModeChange && (
                <DeveloperSection
                  developerMode={developerMode}
                  onDeveloperModeChange={onDeveloperModeChange}
                  onPreviewBootSplash={onPreviewBootSplash}
                />
              )}
              {section === "about" && <AboutSection />}
            </div>
          </div>
        </div>
        <footer className="settings-footer">
          <span className={`settings-dirty-hint${dirty ? " visible" : ""}`} aria-live="polite">
            {dirty ? "有未保存的更改" : ""}
          </span>
          <div className="settings-footer-actions">
            <button type="button" onClick={requestClose}>
              关闭
            </button>
            <button
              className="primary"
              type="button"
              disabled={busy || !draft.vaultPath.trim()}
              onClick={() => void save().catch(() => undefined)}
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </footer>
        {confirmClose && (
          <div className="settings-confirm-backdrop" role="presentation">
            <div className="settings-confirm" role="alertdialog" aria-label="未保存的更改">
              <p>设置有未保存的更改，关闭后将丢失。</p>
              <div className="settings-confirm-actions">
                <button type="button" onClick={() => setConfirmClose(false)}>
                  继续编辑
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                >
                  放弃更改
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void save().catch(() => setConfirmClose(false))}
                >
                  {busy ? "保存中…" : "保存并关闭"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}