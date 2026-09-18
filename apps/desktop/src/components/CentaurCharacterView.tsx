import { useEffect, useRef } from "react";
import { CentaurCharacter } from "../lib/centaur-character/character";
import type { CentaurState } from "../lib/centaur-character/tables";

type CentaurCharacterViewProps = {
  sizePx?: number;
  state?: CentaurState;
  followPointer?: boolean;
  autoCycle?: boolean;
  punctuationFx?: boolean;
  className?: string;
};

export function CentaurCharacterView({
  sizePx = 64,
  state = "happy",
  followPointer = true,
  autoCycle = true,
  punctuationFx = true,
  className,
}: CentaurCharacterViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const characterRef = useRef<CentaurCharacter | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const character = new CentaurCharacter(svg, {
      sizePx,
      state,
      followPointer,
      autoCycle,
      punctuationFx,
    });
    characterRef.current = character;

    return () => {
      character.destroy();
      characterRef.current = null;
    };
  }, [sizePx, state, followPointer, autoCycle, punctuationFx]);

  return (
    <svg
      ref={svgRef}
      className={className}
      role="img"
      aria-label="Centaur"
      width={sizePx}
      height={sizePx}
    />
  );
}
