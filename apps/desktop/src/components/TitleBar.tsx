import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../api";

type TitleBarProps = {
  label: string;
};

export function TitleBar({ label }: TitleBarProps) {
  const tauri = isTauriRuntime();
  const [maximized, setMaximized] = useState(false);

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
      <div className="titlebar-drag" data-tauri-drag-region>
        <span className="titlebar-brand" data-tauri-drag-region>
          WikiHome
        </span>
        {label && label !== "WikiHome" && (
          <span className="titlebar-label" data-tauri-drag-region>
            {label}
          </span>
        )}
      </div>
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
