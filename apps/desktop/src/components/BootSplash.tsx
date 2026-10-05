import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CentaurCharacterView } from "./CentaurCharacterView";

const BootRuezz = memo(function BootRuezz() {
  return (
    <div className="ingest-progress-ruezz">
      <CentaurCharacterView
        sizePx={88}
        state="happy"
        autoCycle={false}
        punctuationFx={false}
        propsFx={true}
        followPointer={false}
      />
    </div>
  );
});

type BootSplashProps = {
  caption?: string;
  subtitle?: string;
  overlay?: boolean;
  animate?: boolean;
  durationMs?: number;
};

export function BootSplash({
  caption = "Ruezz 正在启动…",
  subtitle,
  overlay = false,
  animate = true,
  durationMs = 2400,
}: BootSplashProps) {
  const [percent, setPercent] = useState(animate ? 8 : 42);

  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setPercent(Math.max(8, Math.round(progress * 100)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, durationMs]);

  const pulsing = animate && percent < 100;

  const content = (
    <div
      className={`boot-splash${overlay ? " boot-splash-overlay" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ingest-progress-card boot-splash-card">
        <BootRuezz />
        <p className="ingest-progress-caption">{caption}</p>
        {subtitle && <p className="ingest-progress-subtitle">{subtitle}</p>}
        <div className="ingest-progress-bar" aria-hidden="true">
          <div
            className={`ingest-progress-fill${pulsing ? " pulsing" : ""}`}
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
        {animate && <p className="ingest-progress-percent">{percent}%</p>}
      </div>
    </div>
  );

  if (overlay && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}
