import { useState } from "react";
import { Modal } from "./Modal";

type IngestModalProps = {
  busy: boolean;
  canPickFiles: boolean;
  onClose: () => void;
  onImportFiles: () => Promise<void>;
  onPaste: (title: string, body: string) => Promise<void>;
};

export function IngestModal({
  busy,
  canPickFiles,
  onClose,
  onImportFiles,
  onPaste,
}: IngestModalProps) {
  const [title, setTitle] = useState("剪贴笔记");
  const [body, setBody] = useState("");

  return (
    <Modal title="入库" onClose={onClose} wide>
      <section className="ingest-section">
        <h3>导入文件</h3>
        <p className="hint">
          {canPickFiles
            ? "从本地选择 Markdown / 文本文件，复制进知识库并编译 wiki 页。"
            : "Web 模式下无法打开系统文件选择器，请改用下方粘贴，或在桌面应用中导入。"}
        </p>
        <button
          className="primary"
          type="button"
          disabled={busy || !canPickFiles}
          onClick={() => void onImportFiles()}
        >
          {busy ? "导入中…" : "选择文件…"}
        </button>
      </section>
      <section className="ingest-section">
        <h3>粘贴文本</h3>
        <label className="label">
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题" />
        </label>
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
          onClick={() => void onPaste(title, body)}
        >
          {busy ? "入库中…" : "入库"}
        </button>
      </section>
    </Modal>
  );
}
