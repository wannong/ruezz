import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { createCodemirrorTheme } from "../lib/markdown/codemirrorTheme";

type MarkdownSourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
};

export function MarkdownSourceEditor({
  value,
  onChange,
  onSave,
  placeholder,
  className,
}: MarkdownSourceEditorProps) {
  const extensions = useMemo(
    () => [
      markdown(),
      history(),
      createCodemirrorTheme(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: "Mod-s",
          run: () => {
            onSave?.();
            return true;
          },
        },
      ]),
    ],
    [onSave],
  );

  return (
    <CodeMirror
      className={className ?? "cm-markdown-source"}
      theme="none"
      value={value}
      height="100%"
      extensions={extensions}
      basicSetup={{ lineNumbers: false, foldGutter: false }}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}
