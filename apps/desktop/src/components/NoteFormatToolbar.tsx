import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  CheckSquare,
  Code,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WysiwygEditorApi } from "../lib/markdown/editorApi";

type NoteFormatToolbarProps = {
  api: WysiwygEditorApi | null;
  disabled?: boolean;
  /** Re-render counter the editor bumps on selection changes. */
  version?: number;
  onInsertLink: () => void;
  onInsertWikilink: () => void;
};

const TEXT_COLORS = [
  "#111111",
  "#c00000",
  "#e36c09",
  "#ffc000",
  "#00b050",
  "#0070c0",
  "#7030a0",
  "#7f7f7f",
];

const HIGHLIGHT_COLORS = [
  "#fff3a3",
  "#ffd6a5",
  "#ffadad",
  "#caffbf",
  "#9bf6ff",
  "#bdb2ff",
  "#e2e2e2",
];

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`note-format-btn${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Swatch({
  label,
  colors,
  onPick,
  onClear,
  children,
}: {
  label: string;
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="note-format-swatch" ref={ref}>
      <button
        type="button"
        className="note-format-btn"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>
      {open && (
        <div className="note-format-popover" role="menu">
          <div className="note-format-swatches">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className="note-format-swatch-dot"
                style={{ background: color }}
                aria-label={color}
                title={color}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(color);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="note-format-swatch-clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            清除
          </button>
        </div>
      )}
    </div>
  );
}

export function NoteFormatToolbar({ api, disabled = false, version = 0, onInsertLink, onInsertWikilink }: NoteFormatToolbarProps) {
  const editor = api?.editor() ?? null;
  void version;
  const inactive = disabled || !editor;

  const isActive = (check: (instance: NonNullable<typeof editor>) => boolean) => {
    if (!editor) return false;
    try {
      return check(editor);
    } catch {
      return false;
    }
  };

  const headingLevel = (): number => {
    if (!editor) return 0;
    for (let level = 1; level <= 6; level += 1) {
      if (editor.isActive("heading", { level })) return level;
    }
    return 0;
  };

  const run = (action: (instance: WysiwygEditorApi) => void) => {
    if (inactive || !api) return;
    action(api);
  };

  const iconSize = 15;

  return (
    <div className={`note-format-bar${inactive ? " is-disabled" : ""}`} role="toolbar" aria-label="格式工具栏" aria-disabled={inactive}>
      <div className="note-format-group">
        <ToolButton label="撤销" disabled={inactive} onClick={() => run((a) => a.undo())}>
          <Undo2 size={iconSize} />
        </ToolButton>
        <ToolButton label="重做" disabled={inactive} onClick={() => run((a) => a.redo())}>
          <Redo2 size={iconSize} />
        </ToolButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <select
          className="note-format-select"
          aria-label="段落样式"
          value={headingLevel()}
          disabled={inactive}
          onChange={(event) => run((a) => a.setHeading(Number(event.target.value) as 0 | 1 | 2 | 3))}
        >
          <option value={0}>正文</option>
          <option value={1}>标题 1</option>
          <option value={2}>标题 2</option>
          <option value={3}>标题 3</option>
        </select>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <ToolButton label="加粗" active={isActive((e) => e.isActive("bold"))} disabled={inactive} onClick={() => run((a) => a.toggleBold())}>
          <Bold size={iconSize} />
        </ToolButton>
        <ToolButton label="斜体" active={isActive((e) => e.isActive("italic"))} disabled={inactive} onClick={() => run((a) => a.toggleItalic())}>
          <Italic size={iconSize} />
        </ToolButton>
        <ToolButton label="下划线" active={isActive((e) => e.isActive("underline"))} disabled={inactive} onClick={() => run((a) => a.toggleUnderline())}>
          <Underline size={iconSize} />
        </ToolButton>
        <ToolButton label="删除线" active={isActive((e) => e.isActive("strike"))} disabled={inactive} onClick={() => run((a) => a.toggleStrike())}>
          <Strikethrough size={iconSize} />
        </ToolButton>
        <ToolButton label="下标" active={isActive((e) => e.isActive("subscript"))} disabled={inactive} onClick={() => run((a) => a.toggleSubscript())}>
          <Subscript size={iconSize} />
        </ToolButton>
        <ToolButton label="上标" active={isActive((e) => e.isActive("superscript"))} disabled={inactive} onClick={() => run((a) => a.toggleSuperscript())}>
          <Superscript size={iconSize} />
        </ToolButton>
        <ToolButton label="行内代码" active={isActive((e) => e.isActive("code"))} disabled={inactive} onClick={() => run((a) => a.toggleCode())}>
          <Code size={iconSize} />
        </ToolButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <Swatch label="字体颜色" colors={TEXT_COLORS} onPick={(color) => run((a) => a.setColor(color))} onClear={() => run((a) => a.setColor(null))}>
          <Palette size={iconSize} />
        </Swatch>
        <Swatch label="背景高亮" colors={HIGHLIGHT_COLORS} onPick={(color) => run((a) => a.setHighlight(color))} onClear={() => run((a) => a.setHighlight(null))}>
          <Highlighter size={iconSize} />
        </Swatch>
        <ToolButton label="清除格式" disabled={inactive} onClick={() => run((a) => a.clearFormat())}>
          <Eraser size={iconSize} />
        </ToolButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <ToolButton label="无序列表" active={isActive((e) => e.isActive("bulletList"))} disabled={inactive} onClick={() => run((a) => a.toggleBulletList())}>
          <List size={iconSize} />
        </ToolButton>
        <ToolButton label="有序列表" active={isActive((e) => e.isActive("orderedList"))} disabled={inactive} onClick={() => run((a) => a.toggleOrderedList())}>
          <ListOrdered size={iconSize} />
        </ToolButton>
        <ToolButton label="任务列表" active={isActive((e) => e.isActive("taskList"))} disabled={inactive} onClick={() => run((a) => a.toggleTaskList())}>
          <CheckSquare size={iconSize} />
        </ToolButton>
        <ToolButton label="减少缩进" disabled={inactive} onClick={() => run((a) => a.outdent())}>
          <Outdent size={iconSize} />
        </ToolButton>
        <ToolButton label="增加缩进" disabled={inactive} onClick={() => run((a) => a.indent())}>
          <Indent size={iconSize} />
        </ToolButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <ToolButton label="左对齐" active={isActive((e) => e.isActive({ textAlign: "left" }))} disabled={inactive} onClick={() => run((a) => a.setAlign("left"))}>
          <AlignLeft size={iconSize} />
        </ToolButton>
        <ToolButton label="居中" active={isActive((e) => e.isActive({ textAlign: "center" }))} disabled={inactive} onClick={() => run((a) => a.setAlign("center"))}>
          <AlignCenter size={iconSize} />
        </ToolButton>
        <ToolButton label="右对齐" active={isActive((e) => e.isActive({ textAlign: "right" }))} disabled={inactive} onClick={() => run((a) => a.setAlign("right"))}>
          <AlignRight size={iconSize} />
        </ToolButton>
        <ToolButton label="两端对齐" active={isActive((e) => e.isActive({ textAlign: "justify" }))} disabled={inactive} onClick={() => run((a) => a.setAlign("justify"))}>
          <AlignJustify size={iconSize} />
        </ToolButton>
      </div>
      <span className="note-format-sep" aria-hidden="true" />
      <div className="note-format-group">
        <ToolButton label="引用" active={isActive((e) => e.isActive("blockquote"))} disabled={inactive} onClick={() => run((a) => a.toggleBlockquote())}>
          <Quote size={iconSize} />
        </ToolButton>
        <ToolButton label="代码块" active={isActive((e) => e.isActive("codeBlock"))} disabled={inactive} onClick={() => run((a) => a.toggleCodeBlock())}>
          <Braces size={iconSize} />
        </ToolButton>
        <ToolButton label="公式" disabled={inactive} onClick={() => run((a) => a.insertBlockMath())}>
          <Minus size={iconSize} />
        </ToolButton>
        <ToolButton label="链接" disabled={inactive} onClick={onInsertLink}>
          <Link2 size={iconSize} />
        </ToolButton>
        <ToolButton label="双链" disabled={inactive} onClick={onInsertWikilink}>
          <span aria-hidden="true" className="note-format-glyph">[[</span>
        </ToolButton>
        <ToolButton label="插入图片" disabled={inactive} onClick={() => run((a) => void a.insertImage())}>
          <ImageIcon size={iconSize} />
        </ToolButton>
        <ToolButton label="插入表格" disabled={inactive} onClick={() => run((a) => a.insertTable())}>
          <Table size={iconSize} />
        </ToolButton>
      </div>
      {inactive && <span className="note-format-hint">切换到编辑模式以使用格式工具栏</span>}
    </div>
  );
}
