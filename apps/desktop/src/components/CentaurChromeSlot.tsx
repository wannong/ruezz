import { CentaurCharacterView } from "./CentaurCharacterView";
import { Presence } from "./Presence";

const CENTAUR_TRANSFER_MS = 250;

type CentaurChromeSlotProps = {
  variant: "titlebar" | "header";
  open: boolean;
  active?: boolean;
  onClick?: () => void;
};

export function CentaurChromeSlot({ variant, open, active = false, onClick }: CentaurChromeSlotProps) {
  const character = <CentaurCharacterView sizePx={28} punctuationFx={false} />;

  return (
    <Presence open={open} duration={CENTAUR_TRANSFER_MS}>
      {variant === "titlebar" ? (
        <button
          type="button"
          className={`titlebar-centaur-btn${active ? " active" : ""}`}
          aria-label={active ? "关闭 Agent 对话" : "打开 Agent 对话"}
          title={active ? "关闭 Agent 对话" : "打开 Agent 对话"}
          onClick={onClick}
        >
          {character}
        </button>
      ) : (
        <div className="agent-header-centaur" aria-hidden="true">
          {character}
        </div>
      )}
    </Presence>
  );
}

export const centaurTransferMs = CENTAUR_TRANSFER_MS;
