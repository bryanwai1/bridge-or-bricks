import { useEffect, useRef } from "react";
import * as THREE from "three";
// @ts-expect-error — vanta ships no types
import FOG from "vanta/dist/vanta.fog.min";

interface Props {
  /** Tints the fog per Act, so the room feels the escalation. */
  mood?: "calm" | "pressure" | "crisis" | "gold";
}

const MOODS = {
  // bronze and lamplight, not the blue from the Vanta demo
  calm:     { highlightColor: 0xd9a521, midtoneColor: 0x7a5223, lowlightColor: 0x1a1410, baseColor: 0x0d0a07, speed: 1.1, zoom: 1.1, blurFactor: 0.62 },
  pressure: { highlightColor: 0xe08a3c, midtoneColor: 0x8a4a1e, lowlightColor: 0x1c1109, baseColor: 0x0d0806, speed: 1.8, zoom: 1.25, blurFactor: 0.55 },
  crisis:   { highlightColor: 0xd94b3a, midtoneColor: 0x7a2418, lowlightColor: 0x180c08, baseColor: 0x0b0605, speed: 2.9, zoom: 1.4,  blurFactor: 0.5 },
  gold:     { highlightColor: 0xffd775, midtoneColor: 0xd9a521, lowlightColor: 0x2a1f0a, baseColor: 0x100c05, speed: 1.4, zoom: 1.2,  blurFactor: 0.6 },
} as const;

/**
 * Drifting fog behind every screen that isn't the board.
 *
 * Vanta wants a global THREE by default and pins r134; handing it our own
 * instance keeps a single copy of the library in the bundle and a single WebGL
 * context in the page.
 */
export default function VantaBackdrop({ mood = "calm" }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const fx = useRef<{ destroy: () => void; setOptions?: (o: object) => void } | null>(null);

  useEffect(() => {
    if (!el.current || fx.current) return;
    try {
      fx.current = FOG({
        el: el.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        ...MOODS[mood],
      });
    } catch {
      fx.current = null; // no WebGL: the CSS gradient underneath carries it
    }
    return () => {
      fx.current?.destroy();
      fx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fx.current?.setOptions?.(MOODS[mood]);
  }, [mood]);

  return <div className="vanta-bg" ref={el} aria-hidden />;
}
