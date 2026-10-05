import {
  Bold,
  Image,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import type { RefObject, ReactNode } from "react";
import type { MarkdownLiveEditorApi } from "./MarkdownLiveEditor";

type NoteFormatToolbarProps = {
  disabled?: boolean;
  editorRef: RefObject<MarkdownLiveEditorApi | null>;
};

function FormatButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="note-format-btn"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function NoteFormatToolbar({ disabled = false, editorRef }: NoteFormatToolbarProps) {
  const run = (action: (api: MarkdownLiveEditorApi) => void) => {
    if (disabled) return;
    const api = editorRef.current;
    if (!api?.isReady()) return;
    action(api);
  };

  const iconSize = 15;

  return (
    <div
      className={`note-format-bar${disabled ? " is-disabled" : ""}`}
      role="toolbar"
      aria-label="格式工具栏"
      aria-disabled={disabled}
    >
      <div className="note-format-group" role="presentation">
        <FormatButton label="撤销" disabled={disabled} onClick={() => run((api) => api.undo())}>
          <Undo2 size={iconSize} />
        </FormatButton>
        <FormatButton label="重做" disabled={disabled} onClick={() => run((api) => api.redo())}>
          <Redo2 size={iconSize} />
        </FormatButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group" role="presentation">
        <FormatButton label="加粗" disabled={disabled} onClick={() => run((api) => api.toggleBold())}>
          <Bold size={iconSize} />
        </FormatButton>
        <FormatButton label="斜体" disabled={disabled} onClick={() => run((api) => api.toggleItalic())}>
          <Italic size={iconSize} />
        </FormatButton>
        <FormatButton label="下划线" disabled={disabled} onClick={() => run((api) => api.toggleUnderline())}>
          <Underline size={iconSize} />
        </FormatButton>
        <FormatButton label="删除线" disabled={disabled} onClick={() => run((api) => api.toggleStrikethrough())}>
          <Strikethrough size={iconSize} />
        </FormatButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group" role="presentation">
        <FormatButton label="正文" disabled={disabled} onClick={() => run((api) => api.setHeading(0))}>
          正文
        </FormatButton>
        <FormatButton label="标题 1" disabled={disabled} onClick={() => run((api) => api.setHeading(1))}>
          H1
        </FormatButton>
        <FormatButton label="标题 2" disabled={disabled} onClick={() => run((api) => api.setHeading(2))}>
          H2
        </FormatButton>
        <FormatButton label="标题 3" disabled={disabled} onClick={() => run((api) => api.setHeading(3))}>
          H3
        </FormatButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group" role="presentation">
        <FormatButton label="无序列表" disabled={disabled} onClick={() => run((api) => api.toggleBulletList())}>
          <List size={iconSize} />
        </FormatButton>
        <FormatButton label="有序列表" disabled={disabled} onClick={() => run((api) => api.toggleOrderedList())}>
          <ListOrdered size={iconSize} />
        </FormatButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group" role="presentation">
        <FormatButton
          label="插入图片"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            void editorRef.current?.insertImage();
          }}
        >
          <Image size={iconSize} />
        </FormatButton>
        <FormatButton label="插入表格" disabled={disabled} onClick={() => run((api) => api.insertTable())}>
          <Table size={iconSize} />
        </FormatButton>
      </div>
      {disabled && <span className="note-format-hint">切换到 Live 模式以使用格式工具栏</span>}
    </div>
  );
}
