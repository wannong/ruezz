import type { PageContent, PageSummary } from "../api";
import { MarkdownPreview } from "./MarkdownPreview";

type NoteViewProps = {
  page: PageContent;
  pages: PageSummary[];
  mode: "read" | "source";
  onMode: (mode: "read" | "source") => void;
  onOpen: (id: string) => void;
};

export function NoteView({ page, pages, mode, onMode, onOpen }: NoteViewProps) {
  return (
    <div className="note-view">
      <div className="note-header">
        <div>
          <h1 className="note-title">{page.title ?? page.id}</h1>
          <div className="note-id">{page.id}</div>
        </div>
        <div className="note-mode">
          <button
            type="button"
            className={mode === "read" ? "active" : ""}
            onClick={() => onMode("read")}
          >
            阅读
          </button>
          <button
            type="button"
            className={mode === "source" ? "active" : ""}
            onClick={() => onMode("source")}
          >
            源码
          </button>
        </div>
      </div>
      {mode === "source" ? (
        <pre className="content-text">{page.raw}</pre>
      ) : (
        <MarkdownPreview markdown={page.body} pages={pages} onOpen={onOpen} />
      )}
    </div>
  );
}
