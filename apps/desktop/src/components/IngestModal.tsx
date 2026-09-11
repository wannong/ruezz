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
    <Modal title="导入资料" onClose={onClose} wide>
      <section className="ingest-section">
        <h3>导入文件</h3>
        <p className="hint">
          {canPickFiles
            ? "原件归档到 raw/sources。Markdown / 文本整篇进入 wiki/sources，不按标题拆页。PDF / Word / PPT / Excel 会先转成一篇 Markdown 再入库。概念页请之后在 Agent 里单独内化，不要指望导入时自动拆碎。"
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
        <p className="hint">同样整篇写成一页，不会按段落拆成多篇概念笔记。</p>
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
