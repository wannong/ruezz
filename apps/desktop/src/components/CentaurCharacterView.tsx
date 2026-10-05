import { useEffect, useMemo, useRef } from "react";
import { CentaurCharacter } from "../lib/centaur-character/character";
import {
  ruezzActivityIsDriven,
  ruezzStateForActivity,
  type RuezzActivity,
} from "../lib/centaur-character/activity";
import type { CentaurState } from "../lib/centaur-character/tables";

const PROPS_FX_MIN_PX = 40;

type CentaurCharacterViewProps = {
  sizePx?: number;
  state?: CentaurState;
  activity?: RuezzActivity | null;
  followPointer?: boolean;
  autoCycle?: boolean;
  punctuationFx?: boolean;
  propsFx?: boolean;
  className?: string;
};

export function CentaurCharacterView({
  sizePx = 64,
  state = "happy",
  activity = null,
  followPointer = true,
  autoCycle = true,
  punctuationFx = true,
  propsFx,
  className,
}: CentaurCharacterViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const characterRef = useRef<CentaurCharacter | null>(null);
  const resolvedPropsFx = propsFx ?? sizePx >= PROPS_FX_MIN_PX;

  const driven = ruezzActivityIsDriven(activity);
  const mood = useMemo(
    () => (activity ? ruezzStateForActivity(activity, state) : state),
    [activity, state],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const character = new CentaurCharacter(svg, {
      sizePx,
      state: mood,
      followPointer,
      autoCycle: driven ? false : autoCycle,
      punctuationFx,
      propsFx: resolvedPropsFx,
    });
    characterRef.current = character;

    return () => {
      character.destroy();
      characterRef.current = null;
    };
  }, [sizePx, followPointer, punctuationFx, autoCycle, resolvedPropsFx]);

  useEffect(() => {
    const character = characterRef.current;
    if (!character) return;
    character.setFollowPointer(followPointer);
    character.setPunctuationFx(punctuationFx);
    character.setPropsFx(resolvedPropsFx);
    character.setAutoCycle(driven ? false : autoCycle);
    if (character.state !== mood) character.setState(mood);
  }, [mood, driven, autoCycle, followPointer, punctuationFx, resolvedPropsFx]);

  return (
    <svg
      ref={svgRef}
      className={className}
      role="img"
      aria-label="Ruezz"
      width={sizePx}
      height={sizePx}
    />
  );
}

export type { RuezzActivity };
