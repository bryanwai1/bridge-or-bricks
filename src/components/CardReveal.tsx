import { useEffect, useMemo, useState } from "react";
import { CARD_BY_ID } from "../data/catalog";
import { DECK_BACK, deckOf } from "../data/gates";
import { playRevealFor, sfx } from "../audio/sfx";

export interface RevealOrigin {
  x: number;
  y: number;
}

interface Props {
  cardId: string;
  /** Viewport position of the hex on the map. The hologram is beamed from here. */
  origin?: RevealOrigin | null;
  subtitle?: string;
  /** Offered when the revealed card is an Action card — resolve, then it leaves the map. */
  onResolveAction?: () => void;
  onClose: () => void;
}

const FLIP_MS = 980; // three turns in the air
const SMALL_W = 124;
const SMALL_H = 108;

/** Leaves, embers, dust — one signature per deck. */
const PARTICLE_COUNT: Record<string, number> = {
  green: 16,
  orange: 14,
  red: 22,
  endgame: 18,
  base: 10,
};

export default function CardReveal({ cardId, origin, subtitle, onResolveAction, onClose }: Props) {
  const [phase, setPhase] = useState<"flip" | "project">(origin ? "flip" : "project");
  const [infoIn, setInfoIn] = useState(false);
  const card = CARD_BY_ID[cardId];
  const deck = deckOf(cardId) ?? "green";
  const isAction = card?.kind === "action";

  /* Geometry: where the small map card sits, where the hologram lands. */
  const geo = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const holoW = Math.min(vw * 0.46, 340);
    const holoH = (holoW * 295) / 340;
    const cx = vw / 2;
    const cy = vh * 0.4;
    const ox = origin?.x ?? cx;
    const oy = origin?.y ?? vh * 0.78;
    return {
      vw, vh, holoW, holoH, cx, cy, ox, oy,
      small: { l: ox - SMALL_W / 2, r: ox + SMALL_W / 2, t: oy - SMALL_H / 2, b: oy + SMALL_H / 2 },
      holo: { l: cx - holoW / 2, r: cx + holoW / 2, t: cy - holoH / 2, b: cy + holoH / 2 },
    };
  }, [origin]);

  useEffect(() => {
    if (!origin) {
      sfx.project();
      playRevealFor(cardId);
      const t = setTimeout(() => setInfoIn(true), 520);
      return () => clearTimeout(t);
    }
    sfx.whoosh();
    const flips = [0, 320, 640].map((d) => setTimeout(() => sfx.flip(), d));
    const land = setTimeout(() => {
      setPhase("project");
      sfx.project();
      playRevealFor(cardId);
    }, FLIP_MS);
    const info = setTimeout(() => setInfoIn(true), FLIP_MS + 520);
    return () => {
      flips.forEach(clearTimeout);
      clearTimeout(land);
      clearTimeout(info);
    };
  }, [cardId, origin]);

  const art = card?.art ?? DECK_BACK[deck];
  const projecting = phase === "project";
  const n = PARTICLE_COUNT[deck] ?? 12;

  return (
    <div
      className={`reveal rv-${deck} ${projecting ? "rv-on" : ""}`}
      onClick={() => projecting && onClose()}
    >
      {/* --- light tethers: the map tile beaming the hologram into view --- */}
      {origin && (
        <svg className={`rv-beams ${projecting ? "in" : ""}`} width={geo.vw} height={geo.vh} aria-hidden>
          <defs>
            <linearGradient id="rvBeam" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--ray)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--ray)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="rvVee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ray)" stopOpacity="0" />
              <stop offset="55%" stopColor="var(--ray)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--ray)" stopOpacity="0.42" />
            </linearGradient>
          </defs>

          {/* V of light falling onto the hologram from above */}
          <polygon
            className="rv-vee"
            fill="url(#rvVee)"
            points={`${geo.cx - 10},-20 ${geo.cx + 10},-20 ${geo.holo.r + 34},${geo.holo.b} ${geo.holo.l - 34},${geo.holo.b}`}
          />

          {/* projection cone: two side faces from the map tile up to the hologram */}
          <polygon
            className="rv-cone"
            fill="url(#rvBeam)"
            points={`${geo.small.l},${geo.small.t} ${geo.holo.l},${geo.holo.t} ${geo.holo.l},${geo.holo.b} ${geo.small.l},${geo.small.b}`}
          />
          <polygon
            className="rv-cone"
            fill="url(#rvBeam)"
            points={`${geo.small.r},${geo.small.t} ${geo.holo.r},${geo.holo.t} ${geo.holo.r},${geo.holo.b} ${geo.small.r},${geo.small.b}`}
          />

          {/* four corner tethers */}
          {[
            [geo.small.l, geo.small.t, geo.holo.l, geo.holo.t],
            [geo.small.r, geo.small.t, geo.holo.r, geo.holo.t],
            [geo.small.l, geo.small.b, geo.holo.l, geo.holo.b],
            [geo.small.r, geo.small.b, geo.holo.r, geo.holo.b],
          ].map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              className="rv-tether"
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--ray)"
              strokeWidth={1.6}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </svg>
      )}

      {/* --- phase 1: the card flips three times above its hex --- */}
      {origin && (
        <div
          className={`rv-map-card ${projecting ? "landed" : "flipping"}`}
          style={{ left: geo.small.l, top: geo.small.t, width: SMALL_W, height: SMALL_H }}
        >
          <div className="rv-face rv-back"><img src={DECK_BACK[deck]} alt="" /></div>
          <div className="rv-face rv-front"><img src={art} alt="" /></div>
        </div>
      )}

      {/* --- phase 2: the hologram --- */}
      <div
        className={`rv-holo ${projecting ? "in" : ""}`}
        style={
          {
            width: geo.holoW,
            height: geo.holoH,
            left: geo.holo.l,
            top: geo.holo.t,
            "--dx": `${geo.ox - geo.cx}px`,
            "--dy": `${geo.oy - geo.cy}px`,
          } as React.CSSProperties
        }
      >
        <img src={art} alt={card?.title ?? cardId} />
        <span className="rv-scan" aria-hidden />
        <span className="rv-particles" aria-hidden>
          {Array.from({ length: n }, (_, i) => (
            <i
              key={i}
              className="rv-p"
              style={{
                left: `${(i * 97) % 100}%`,
                animationDuration: `${2.2 + ((i * 7) % 5) * 0.5}s`,
                animationDelay: `${(i % 8) * 0.28}s`,
              }}
            />
          ))}
        </span>
      </div>

      {/* --- the read-out --- */}
      <div className={`rv-info ${infoIn ? "in" : ""}`} style={{ top: geo.holo.b + 26 }}>
        <h2>{card?.title ?? cardId}</h2>
        {subtitle && <p className="muted small">{subtitle}</p>}
        {card?.effectText && <p className="rv-effect">{card.effectText}</p>}
        {card?.scopeText && <p className="muted small">{card.scopeText}</p>}
        {isAction && <p className="rv-tag">Action card — resolve now, then the hex reopens</p>}
        <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          {isAction && onResolveAction && (
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation();
                sfx.approve();
                onResolveAction();
              }}
            >
              Resolve and clear the hex
            </button>
          )}
          <button className="chip" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
