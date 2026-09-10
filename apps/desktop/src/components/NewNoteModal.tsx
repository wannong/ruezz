import { useEffect, useState } from "react";
import { slugifyNoteId } from "../lib/noteId";
import { Modal } from "./Modal";

type NewNoteModalProps = {
  busy: boolean;
  onClose: () => void;
  onCreate: (id: string, title: string) => Promise<void>;
};

export function NewNoteModal({ busy, onClose, onCreate }: NewNoteModalProps) {
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);

  useEffect(() => {
    if (!idTouched) setId(slugifyNoteId(title));
  }, [title, idTouched]);

  const canCreate = id.trim().length > 0 && title.trim().length > 0;

  return (
    <Modal title="新建笔记" onClose={onClose}>
      <div className="grid-form">
        <label className="label">
          标题
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如 Attention"
          />
        </label>
        <label className="label">
          路径
          <input
            value={id}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
            placeholder="concepts/attention"
          />
        </label>
        <p className="hint">将写入 wiki/{id || "…"}.md，可用 / 表示文件夹。</p>
        <div className="row">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="primary"
            type="button"
            disabled={busy || !canCreate}
            onClick={() => void onCreate(id.trim(), title.trim())}
          >
            {busy ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
