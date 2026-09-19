import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu } from "lucide-react";
import { isTauriRuntime } from "../api";
import { CentaurChromeSlot } from "./CentaurChromeSlot";
import { ContextMenu } from "./ContextMenu";
import type { RuezzActivity } from "./CentaurCharacterView";

export type TitleBarCentaurProps = {
  open: boolean;
  visible: boolean;
  onToggle: () => void;
  activity?: RuezzActivity | null;
};

type TitleBarProps = {
  label: string;
  sessionTitle?: string | null;
  hasVault: boolean;
  centaur?: TitleBarCentaurProps | null;
  onNewVault: () => void;
  onOpenVault: () => void;
  onRevealVault: () => void;
};

export function TitleBar({
  label,
  sessionTitle,
  hasVault,
  centaur,
  onNewVault,
  onOpenVault,
  onRevealVault,
}: TitleBarProps) {
  const tauri = isTauriRuntime();
  const [maximized, setMaximized] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tauri) return;
    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const next = await win.isMaximized();
        if (!cancelled) setMaximized(next);
        unlisten = await win.onResized(async () => {
          try {
            const max = await win.isMaximized();
            if (!cancelled) setMaximized(max);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* permissions / non-desktop */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [tauri]);

  const win = () => getCurrentWindow();

  return (
    <header className="titlebar">
      <div className="titlebar-start">
        <button
          type="button"
          className="titlebar-menu-btn"
          aria-label="知识库选项"
          title="知识库选项"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 2 });
          }}
        >
          <Menu size={16} />
        </button>
        <span className="titlebar-brand" data-tauri-drag-region>
          Ruezz
        </span>
        {label && label !== "Ruezz" && (
          <span className="titlebar-label" data-tauri-drag-region>
            {label}
          </span>
        )}
        {sessionTitle && (
          <span className="titlebar-session" data-tauri-drag-region title={sessionTitle}>
            {sessionTitle}
          </span>
        )}
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      {centaur && (
        <CentaurChromeSlot
          variant="titlebar"
          open={centaur.visible}
          active={centaur.open}
          activity={centaur.activity}
          onClick={centaur.onToggle}
        />
      )}
      {tauri && (
        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-btn"
            aria-label="最小化"
            title="最小化"
            onClick={() => void win().minimize()}
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            className="titlebar-btn"
            aria-label={maximized ? "还原" : "最大化"}
            title={maximized ? "还原" : "最大化"}
            onClick={() => void win().toggleMaximize()}
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="titlebar-btn close"
            aria-label="关闭"
            title="关闭"
            onClick={() => void win().close()}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={[
            { type: "item", label: "新建知识库…", onClick: onNewVault },
            { type: "item", label: "打开知识库…", onClick: onOpenVault },
            {
              type: "item",
              label: "在资源管理器中打开",
              disabled: !hasVault,
              onClick: onRevealVault,
            },
        ]}
        onClose={() => setMenu(null)}
      />
    </header>
  );
}

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path fill="currentColor" d="M0 5h10v1H0z" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M1.5 1.5h7v7h-7z" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M2.5 3.5h5v5h-5z" />
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M3.5 3.5V2.5h5v5H7.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M1.2 1.2 8.8 8.8M8.8 1.2 1.2 8.8"
      />
    </svg>
  );
}
