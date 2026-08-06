import { useEffect, useRef, useState } from "react";
import type { CardDef } from "../data/catalog";
import { sfx } from "../audio/sfx";

interface Props {
  cards: CardDef[];
  deckColor: string;
  isLocked: (c: CardDef) => boolean;
  onPlace: (c: CardDef) => void;
}

const STEP = 27; // degrees between neighbours — wide enough that hexes never touch
const RADIUS = 430; // px out from the turntable axis
const VISIBLE = 4; // cards drawn either side of the front
const DEPTH_LAYERS = 6; // slabs stacked behind the face to give the card its edge
const LAYER_PX = 2.6;

/**
 * The deck on a turntable. The card at the front sits in a hex-shaped shaft of
 * light, standing on a glowing rune disc with embers coming off it. Drag to
 * spin, or use the arrows.
 */
export default function CardRing({ cards, deckColor, isLocked, onPlace }: Props) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; base: number } | null>(null);

  useEffect(() => setIndex(0), [cards.length, deckColor]);

  const pos = index + drag;
  const front = Math.max(0, Math.min(cards.length - 1, Math.round(pos)));

  const spin = (delta: number) => {
    sfx.tap();
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, base: index };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag((e.clientX - start.current.x) / -120);
  };
  const onUp = () => {
    if (!start.current) return;
    setIndex(Math.max(0, Math.min(cards.length - 1, Math.round(index + drag))));
    setDrag(0);
    start.current = null;
  };

  if (cards.length === 0) {
    return <p className="muted small center">No cards match that search.</p>;
  }

  const frontCard = cards[front];
  const frontLocked = isLocked(frontCard);

  return (
    <div className="ring-wrap" style={{ "--deck": deckColor } as React.CSSProperties}>
      <div
        className="ring-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* a shaft of light narrowing onto the hex silhouette below */}
        <div className="ring-shaft" aria-hidden>
          <span className="rs-core" />
          <span className="rs-edge" />
        </div>

        <div className="ring" style={{ transform: `translateZ(-${RADIUS}px) rotateY(${-pos * STEP}deg)` }}>
          {cards.map((c, i) => {
            const delta = i - pos;
            if (Math.abs(delta) > VISIBLE) return null;
            const near = Math.abs(delta) < 0.5;
            const thick = Math.abs(delta) < 2.2; // only nearby cards pay for the extrusion
            const locked = isLocked(c);
            return (
              <button
                key={c.id}
                className={`ring-card${near ? " front" : ""}${locked ? " locked" : ""}`}
                style={{
                  transform: `rotateY(${i * STEP}deg) translateZ(${RADIUS}px)`,
                  opacity: Math.max(0.1, 1 - Math.abs(delta) / (VISIBLE + 0.8)),
                  zIndex: 100 - Math.round(Math.abs(delta) * 10),
                }}
                onClick={() => {
                  if (near) {
                    if (locked) return sfx.denied();
                    onPlace(c);
                  } else {
                    sfx.tap();
                    setIndex(i);
                  }
                }}
              >
                {near && <span className="rc-halo" aria-hidden />}
                {thick &&
                  Array.from({ length: DEPTH_LAYERS }, (_, k) => (
                    <img
                      key={k}
                      className="rc-slab"
                      src={c.art}
                      alt=""
                      aria-hidden
                      draggable={false}
                      style={{
                        transform: `translateZ(-${(k + 1) * LAYER_PX}px)`,
                        filter: `brightness(${(0.62 - k * 0.09).toFixed(2)}) saturate(0.5)`,
                      }}
                    />
                  ))}
                <img className="rc-face" src={c.art} alt={c.title} loading="lazy" draggable={false} />
              </button>
            );
          })}
        </div>

        {/* the rune disc the front card stands on */}
        <div className="ring-disc" aria-hidden>
          <span className="rd-glow" />
          <span className="rd-ring" />
          <span className="rd-ticks">
            {Array.from({ length: 12 }, (_, k) => (
              <i key={k} style={{ transform: `rotate(${k * 30}deg) translateY(-46px)` }} />
            ))}
          </span>
          <span className="rd-flames">
            {Array.from({ length: 11 }, (_, k) => (
              <i
                key={k}
                style={{
                  left: `${6 + k * 8.6}%`,
                  animationDuration: `${1.5 + ((k * 5) % 4) * 0.35}s`,
                  animationDelay: `${(k % 6) * 0.24}s`,
                }}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="ring-plate">
        <button className="ring-arrow" onClick={() => spin(-1)} disabled={front === 0} aria-label="Previous card">‹</button>
        <div className="ring-label">
          <b>{frontLocked ? "🔒 " : ""}{frontCard.title}</b>
          <span className="ring-id">
            {frontCard.id} · {front + 1} of {cards.length}
          </span>
        </div>
        <button className="ring-arrow" onClick={() => spin(1)} disabled={front === cards.length - 1} aria-label="Next card">›</button>
      </div>
    </div>
  );
}
