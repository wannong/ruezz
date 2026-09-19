import type { CentaurState } from "./tables";

export const RUEZZ_CELEBRATE_MS = 3200;

export type RuezzActivity = {
  busy: boolean;
  pendingUser?: string | null;
  streamingPhase: "thinking" | "tool" | "answer" | null;
  streamingText?: string;
  streamingTools?: Array<{ status: "running" | "done" | "error" }>;
  celebrate?: boolean;
};

export function ruezzStateForActivity(
  activity: RuezzActivity,
  idleState: CentaurState = "happy",
): CentaurState {
  const tools = activity.streamingTools ?? [];
  const toolRunning = tools.some((tool) => tool.status === "running");
  const toolErrored = tools.some((tool) => tool.status === "error");

  if (!activity.busy && !activity.pendingUser) {
    if (activity.celebrate) return "proud";
    return idleState;
  }

  if (activity.pendingUser && !activity.busy) return "listening";

  if (toolErrored) return "confused";

  if (activity.streamingPhase === "tool" || toolRunning) return "curious";

  if (activity.streamingPhase === "answer" || Boolean(activity.streamingText?.trim())) {
    return "happy";
  }

  if (activity.streamingPhase === "thinking") return "thinking";

  return "thinking";
}

export function ruezzActivityIsDriven(activity?: RuezzActivity | null): boolean {
  if (!activity) return false;
  return activity.busy || Boolean(activity.pendingUser) || Boolean(activity.celebrate);
}

export function ruezzActivityFromAgent(props: {
  busy: boolean;
  pendingUser: string | null;
  streamingPhase: RuezzActivity["streamingPhase"];
  streamingText: string;
  streamingTools: RuezzActivity["streamingTools"];
  celebrate?: boolean;
}): RuezzActivity {
  return {
    busy: props.busy,
    pendingUser: props.pendingUser,
    streamingPhase: props.streamingPhase,
    streamingText: props.streamingText,
    streamingTools: props.streamingTools,
    celebrate: props.celebrate,
  };
}
