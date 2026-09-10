import type { PageContent, PageSummary } from "../api";
import { markdownBody } from "../lib/noteId";
import { MarkdownPreview } from "./MarkdownPreview";

export type NoteMode = "read" | "edit";

type NoteViewProps = {
  page: PageContent;
  pages: PageSummary[];
  mode: NoteMode;
  draft: string;
  dirty: boolean;
  saving: boolean;
  onMode: (mode: NoteMode) => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onOpen: (id: string) => void;
};

export function NoteView({
  page,
  pages,
  mode,
  draft,
  dirty,
  saving,
  onMode,
  onDraft,
  onSave,
  onOpen,
}: NoteViewProps) {
  return (
    <div className="note-view">
      <div className="note-header">
        <div>
          <h1 className="note-title">{page.title ?? page.id}</h1>
          <div className="note-id">{page.path}</div>
        </div>
        <div className="note-toolbar">
          <div className="note-mode">
            <button type="button" className={mode === "read" ? "active" : ""} onClick={() => onMode("read")}>
              阅读
            </button>
            <button type="button" className={mode === "edit" ? "active" : ""} onClick={() => onMode("edit")}>
              编辑
            </button>
          </div>
          <button
            type="button"
            className="primary note-save"
            disabled={!dirty || saving}
            onClick={onSave}
          >
            {saving ? "保存中…" : dirty ? "保存" : "已保存"}
          </button>
        </div>
      </div>
      {mode === "edit" ? (
        <div className="note-edit-split">
          <textarea
            className="note-editor"
            value={draft}
            spellCheck={false}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (dirty && !saving) onSave();
              }
            }}
          />
          <div className="note-edit-preview">
            <MarkdownPreview markdown={markdownBody(draft)} pages={pages} onOpen={onOpen} />
          </div>
        </div>
      ) : (
        <div className="note-read">
          <MarkdownPreview markdown={page.body} pages={pages} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}
