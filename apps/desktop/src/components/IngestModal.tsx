import { useState } from "react";
import { Modal } from "./Modal";

type IngestModalProps = {
  busy: boolean;
  canPickFiles: boolean;
  developerMode?: boolean;
  onClose: () => void;
  onImportFiles: () => Promise<void>;
  onPaste: (body: string) => Promise<void>;
  onPreviewProgress?: () => Promise<void>;
  destinationLabel?: string;
};

export function IngestModal({
  busy,
  canPickFiles,
  developerMode = false,
  onClose,
  onImportFiles,
  onPaste,
  onPreviewProgress,
  destinationLabel,
}: IngestModalProps) {
  const [body, setBody] = useState("");

  return (
    <Modal title="导入资料" onClose={onClose} wide>
      {destinationLabel && <div className="ingest-destination">导入到：<strong>{destinationLabel}</strong></div>}
      {canPickFiles ? (
        <section className="ingest-section">
          <h3>导入文件</h3>
          <p className="hint">PDF / Office 会先转成 Markdown，整篇写入文献库，不自动拆概念页。</p>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void onImportFiles()}
          >
            选择文件…
          </button>
        </section>
      ) : (
        <p className="hint ingest-web-hint">Web 模式无法选择本地文件，请使用下方粘贴入库。</p>
      )}
      <section className="ingest-section">
        <h3>粘贴文本</h3>
        <p className="hint">整篇保存为一页，标题将从正文首行自动识别。</p>
        <label className="label">
          正文
          <textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="粘贴正文…"
          />
        </label>
        <button
          className="primary"
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void onPaste(body)}
        >
          {busy ? "入库中…" : "入库"}
        </button>
      </section>
      {developerMode && onPreviewProgress && (
        <section className="ingest-section ingest-dev-section">
          <h3>开发者</h3>
          <p className="hint">仅模拟入库过场，不写入文献库。Web / 桌面模式均可验收。</p>
          <button
            className="ghost ingest-dev-action"
            type="button"
            disabled={busy}
            onClick={() => void onPreviewProgress()}
          >
            预览加载动画
          </button>
        </section>
      )}
    </Modal>
  );
}
