import { memo } from "react";
import { CentaurCharacterView } from "./CentaurCharacterView";
import type { IngestProgressSnapshot, IngestStepId } from "../lib/ingestProgress";
import { INGEST_STEP_LABELS } from "../lib/ingestProgress";

const IngestRuezz = memo(function IngestRuezz() {
  return (
    <div className="ingest-progress-ruezz">
      <CentaurCharacterView
        sizePx={88}
        state="reading"
        autoCycle={false}
        punctuationFx={false}
        propsFx={true}
        followPointer={false}
      />
    </div>
  );
});

type IngestProgressOverlayProps = {
  snapshot: IngestProgressSnapshot;
};

function stepStatus(step: IngestStepId, snapshot: IngestProgressSnapshot): "done" | "active" | "pending" {
  if (snapshot.completedStepIds.includes(step)) return "done";
  if (snapshot.activeStep === step) return "active";
  return "pending";
}

export function IngestProgressOverlay({ snapshot }: IngestProgressOverlayProps) {
  const steps = ["pick", ...snapshot.visibleSteps.filter((s) => s !== "pick")] as IngestStepId[];

  return (
    <div className="ingest-progress-overlay" role="dialog" aria-modal="true" aria-label="导入进度">
      <div className="ingest-progress-card">
        <IngestRuezz />
        <p className="ingest-progress-caption">{snapshot.caption}</p>
        {snapshot.subtitle && <p className="ingest-progress-subtitle">{snapshot.subtitle}</p>}
        <div className="ingest-progress-bar" aria-hidden="true">
          <div
            className={`ingest-progress-fill${snapshot.pulsing ? " pulsing" : ""}`}
            style={{ transform: `scaleX(${snapshot.percent / 100})` }}
          />
        </div>
        <p className="ingest-progress-percent">{snapshot.percent}%</p>
        <ul className="ingest-progress-steps">
          {steps.map((step) => {
            const status = stepStatus(step, snapshot);
            return (
              <li key={step} className={`ingest-progress-step ingest-progress-step-${status}`}>
                <span className="ingest-progress-step-mark" aria-hidden="true">
                  {status === "done" ? "✓" : status === "active" ? "●" : "○"}
                </span>
                <span>{INGEST_STEP_LABELS[step]}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
