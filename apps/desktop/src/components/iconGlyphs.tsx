import type { ReactNode } from "react";

type GlyphProps = {
  size?: number;
  className?: string;
  children: ReactNode;
};

function Glyph({ size = 18, className, children }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function BotGlyph({ size = 18 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <g className="icon-motion">
        <path d="M9 13v2" />
        <path d="M15 13v2" />
      </g>
    </Glyph>
  );
}

export function PasteGlyph({ size = 18 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10" />
      <path className="icon-motion" d="m17 10 4 4-4 4" />
    </Glyph>
  );
}

export function FolderTreeGlyph({ size = 18 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 5a2 2 0 0 0 2 2h3" />
      <path d="M3 3v13a2 2 0 0 0 2 2h3" />
      <path
        className="icon-branch-a"
        d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"
      />
      <path
        className="icon-branch-b"
        d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"
      />
    </Glyph>
  );
}

export function FilePlusGlyph({ size = 18 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <g className="icon-motion">
        <path d="M9 15h6" />
        <path d="M12 18v-6" />
      </g>
    </Glyph>
  );
}

export function HistoryGlyph({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path className="icon-motion" d="M12 7v5l4 2" />
    </Glyph>
  );
}

export function GaugeGlyph({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      <path className="icon-motion" d="m12 14 4-4" />
    </Glyph>
  );
}

export function PanelCloseGlyph({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path className="icon-motion" d="m8 9 3 3-3 3" />
    </Glyph>
  );
}

export function PanelOpenGlyph({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path className="icon-motion" d="m10 15-3-3 3-3" />
    </Glyph>
  );
}

export function SendGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <g className="icon-motion">
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </g>
    </Glyph>
  );
}

export function StopGlyph({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <rect className="icon-motion" width="18" height="18" x="3" y="3" rx="2" />
    </Glyph>
  );
}
