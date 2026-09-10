import { Command } from "cmdk";
import type { PageSummary } from "../api";

export type PaletteMode = "quick" | "commands";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type CommandPaletteProps = {
  mode: PaletteMode;
  pages: PageSummary[];
  commands: PaletteCommand[];
  onClose: () => void;
  onOpenPage: (id: string) => void;
};

export function CommandPalette({ mode, pages, commands, onClose, onOpenPage }: CommandPaletteProps) {
  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <Command label={mode === "quick" ? "快速打开" : "命令"} loop>
          <Command.Input
            placeholder={mode === "quick" ? "打开页面…" : "运行命令…"}
            autoFocus
          />
          <Command.List>
            <Command.Empty>没有匹配</Command.Empty>
            {mode === "quick" && (
              <Command.Group heading="页面">
                {pages.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`${p.title ?? ""} ${p.id}`}
                    onSelect={() => {
                      onOpenPage(p.id);
                      onClose();
                    }}
                  >
                    <span>{p.title ?? p.id}</span>
                    <span className="palette-hint">{p.id}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {mode === "commands" && (
              <Command.Group heading="命令">
                {commands.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.label} ${c.hint ?? ""}`}
                    onSelect={() => {
                      c.run();
                      onClose();
                    }}
                  >
                    <span>{c.label}</span>
                    {c.hint && <span className="palette-hint">{c.hint}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
