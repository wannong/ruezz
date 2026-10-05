import { useEffect, useState } from "react";
import { IngestProgressOverlay } from "./IngestProgressOverlay";
import { runIngestProgressAnimation, type IngestProgressSnapshot } from "../lib/ingestProgress";

export type IngestProgressRunner = {
  run: (
    paths: string[],
    processFile: (path: string) => Promise<void>,
  ) => Promise<void>;
};

type IngestProgressHostProps = {
  runnerRef: React.MutableRefObject<IngestProgressRunner | null>;
};

/** Isolates ingest overlay state so progress ticks do not re-render Workspace. */
export function IngestProgressHost({ runnerRef }: IngestProgressHostProps) {
  const [snapshot, setSnapshot] = useState<IngestProgressSnapshot | null>(null);

  useEffect(() => {
    runnerRef.current = {
      run: async (paths, processFile) => {
        try {
          await runIngestProgressAnimation(paths, setSnapshot, processFile);
        } finally {
          setSnapshot(null);
        }
      },
    };
    return () => {
      runnerRef.current = null;
    };
  }, [runnerRef]);

  if (!snapshot) return null;
  return <IngestProgressOverlay snapshot={snapshot} />;
}
