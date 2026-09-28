import { useState } from "react";
import type { VaultSettings } from "../api";
import { hydrateProviders } from "../lib/llmProviders";
import type { ColorPalette } from "../theme";
import { Modal } from "./Modal";
import { SettingsFields } from "./SettingsFields";

type SettingsModalProps = {
  settings: VaultSettings;
  palette: ColorPalette;
  onPaletteChange: (palette: ColorPalette) => void;
  busy: boolean;
  onClose: () => void;
  onSave: (next: VaultSettings) => Promise<void>;
};

export function SettingsModal({ settings, palette, onPaletteChange, busy, onClose, onSave }: SettingsModalProps) {
  const [draft, setDraft] = useState(() => hydrateProviders(settings));

  return (
    <Modal title="设置" onClose={onClose} wide>
      <SettingsFields settings={draft} onChange={setDraft} palette={palette} onPaletteChange={onPaletteChange} />
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          type="button"
          disabled={busy || !draft.vaultPath.trim()}
          onClick={() => void onSave(draft)}
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </Modal>
  );
}
