import { useRef, useState, type MouseEvent } from "react";
import type { PageContent, PageSummary } from "../api";
import { markdownBody } from "../lib/noteId";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
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
  onLink: (range: { start: number; end: number }) => void;
  assetRoot?: string;
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
  onLink,
  assetRoot,
}: NoteViewProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; start: number; end: number } | null>(null);

  const openEditorMenu = (e: MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    setMenu({ x: e.clientX, y: e.clientY, start: el.selectionStart, end: el.selectionEnd });
  };

  const replaceRange = (next: string, start: number, end: number) => {
    onDraft(draft.slice(0, start) + next + draft.slice(end));
  };

  const copyRange = async (start: number, end: number) => {
    const text = draft.slice(start, end);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      document.execCommand("copy");
    }
  };

  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    const { start, end } = menu;
    return [
      {
        type: "item",
        label: "剪切",
        onClick: () => {
          if (start === end) return;
          void copyRange(start, end).then(() => replaceRange("", start, end));
        },
      },
      {
        type: "item",
        label: "复制",
        onClick: () => {
          void copyRange(start, end);
        },
      },
      {
        type: "item",
        label: "粘贴",
        onClick: () => {
          void navigator.clipboard
            .readText()
            .then((text) => replaceRange(text, start, end))
            .catch(() => {
              editorRef.current?.focus();
              document.execCommand("paste");
            });
        },
      },
      { type: "sep" },
      {
        type: "item",
        label: "链接",
        onClick: () => onLink({ start, end }),
      },
    ];
  };

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
            ref={editorRef}
            className="note-editor"
            value={draft}
            spellCheck={false}
            onContextMenu={openEditorMenu}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (dirty && !saving) onSave();
              }
            }}
          />
          <div className="note-edit-preview">
            <MarkdownPreview markdown={markdownBody(draft)} pages={pages} onOpen={onOpen} assetRoot={assetRoot} basePath={page.path} />
          </div>
        </div>
      ) : (
        <div className="note-read">
          <MarkdownPreview markdown={page.body} pages={pages} onOpen={onOpen} assetRoot={assetRoot} basePath={page.path} />
        </div>
      )}
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? menuItems() : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
