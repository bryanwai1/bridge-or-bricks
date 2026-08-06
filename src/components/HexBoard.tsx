import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { DerivedState, SlotRef } from "../types";
import { slotKey, edgeKey } from "../types";
import {
  MAP_SIZE,
  allSlots,
  allEdges,
  hexPoints,
  slotCenter,
  HEX_W,
  HEX_H,
} from "../data/board";
import { CARD_BY_ID } from "../data/catalog";
import { DECK_BACK, deckOf } from "../data/gates";
import Sky360 from "./Sky360";
import Props3D from "./Props3D";
import type { EnvKey } from "../world/environments";

export interface BoardSelection {
  kind: "slot" | "edge";
  key: string;
  slot?: SlotRef;
}

interface Props {
  state: DerivedState;
  mode: "edit" | "view";
  wallMode?: boolean;
  selectedKey?: string | null;
  onSelect?: (sel: BoardSelection) => void;
  /** Board spin in degrees — any value, not just quarter turns. */
  rotation?: number;
  /** Camera pitch: 0 = straight down, ~65 = low over the table. */
  tilt?: number;
  /** When on, a one-finger drag orbits instead of panning. */
  orbitMode?: boolean;
  /** Drag deltas in px: (+dx = spin right, +dy = drop the camera lower). */
  onOrbit?: (dx: number, dy: number) => void;
  /** Which world surrounds the table. "none" renders the bare table instead. */
  sky?: EnvKey;
  /** Slot keys to ring as legal destinations, used by Move mode. */
  highlight?: Set<string>;
  /** Edge keys to flag as needing a wall. */
  edgeAlert?: Set<string>;
}

export interface BoardHandle {
  zoomBy: (factor: number) => void;
  /** Frame the whole mat with a little world showing around it. */
  fitBoard: () => void;
  /** Viewport pixel position of a hex centre, accounting for spin, zoom, tilt and fit. */
  getSlotScreenPos: (key: string) => { x: number; y: number } | null;
}

const SLOTS = allSlots();
const EDGES = allEdges();
const MID = MAP_SIZE / 2;
const PERSPECTIVE = 1500; // must match --board perspective in fx.css
const MIN_VIEW = MAP_SIZE / 10; // closest zoom
const MAX_VIEW = MAP_SIZE * 2.8; // pulled right back, mat small in the world

/* The GLB diorama layer is gone. The Base model never lined up with the SVG
   mat under camera pitch and hid the card art behind it, so tiles are flat
   card art only. Sky360 still uses Three.js for the surrounding world. */

const HexBoard = forwardRef<BoardHandle, Props>(function HexBoard(
  { state, mode, wallMode, selectedKey, onSelect, rotation = 0, tilt = 0, orbitMode, onOrbit, sky, highlight, edgeAlert }: Props,
  handleRef,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // start framed with a margin of world showing, rather than jammed to the edges
  const [view, setView] = useState({ x: -MAP_SIZE * 0.09, y: -MAP_SIZE * 0.09, size: MAP_SIZE * 1.18 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; orbit: boolean } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ dist: number; angle: number; midY: number } | null>(null);

  /* keep the real box size so the camera can fit the board to the frame */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- camera solve: pitch the plane, then scale it to fill the frame ---- */
  const rad = (tilt * Math.PI) / 180;
  const sinT = Math.sin(rad);
  const cosT = Math.cos(rad);
  const S = Math.max(1, Math.min(box.w || 600, box.h || 600));
  const pNear = PERSPECTIVE / Math.max(200, PERSPECTIVE - (S / 2) * sinT);
  const pFar = PERSPECTIVE / (PERSPECTIVE + (S / 2) * sinT);
  const projW = S * pNear;
  const projH = (S / 2) * cosT * (pNear + pFar);
  // 0.86 keeps a margin of world visible around the mat instead of filling edge to edge
  const camScale = Math.max(
    0.4,
    Math.min(1.85, Math.min((box.w || S) / projW, (box.h || S) / projH) * 0.86),
  );
  // the pitched board's visual centre drifts down; pull it back to the middle
  const camOffset = -(camScale * (S / 2) * cosT * (pNear - pFar)) / 2;

  const clampView = (v: { x: number; y: number; size: number }) => {
    // room to pull right back and see the mat sitting in the world, not just fill the frame
    const size = Math.min(MAX_VIEW, Math.max(MIN_VIEW, v.size));
    const slackX = size * 0.3;
    const slackY = size * 0.3;
    const lo = -slackX;
    const hi = MAP_SIZE - size + slackX;
    // once you are wider than the map there is nothing to pan to — hold it centred
    const x = hi < lo ? (MAP_SIZE - size) / 2 : Math.min(hi, Math.max(lo, v.x));
    const loY = -slackY;
    const hiY = MAP_SIZE - size + slackY;
    const y = hiY < loY ? (MAP_SIZE - size) / 2 : Math.min(hiY, Math.max(loY, v.y));
    return { x, y, size };
  };

  const toLayoutBox = (cx: number, cy: number, b: DOMRect) => {
    const s = Math.min(b.width / view.size, b.height / view.size);
    return {
      x: (b.width - view.size * s) / 2 + (cx - view.x) * s,
      y: (b.height - view.size * s) / 2 + (cy - view.y) * s,
    };
  };

  useImperativeHandle(handleRef, () => ({
    zoomBy: (factor: number) =>
      setView((v) => {
        const size = v.size * factor;
        const cx = v.x + v.size / 2;
        const cy = v.y + v.size / 2;
        return clampView({ x: cx - size / 2, y: cy - size / 2, size });
      }),
    fitBoard: () => setView(clampView({ x: -MAP_SIZE * 0.09, y: -MAP_SIZE * 0.09, size: MAP_SIZE * 1.18 })),
    getSlotScreenPos: (key: string) => {
      const b = wrapRef.current?.getBoundingClientRect();
      if (!b) return null;
      const [col, row] = key.split(",").map(Number);
      if (Number.isNaN(col) || Number.isNaN(row)) return null;

      let { x: cx, y: cy } = slotCenter({ col, row });
      if (rotation) {
        const r = (rotation * Math.PI) / 180;
        const dx = cx - MID;
        const dy = cy - MID;
        cx = MID + dx * Math.cos(r) - dy * Math.sin(r);
        cy = MID + dx * Math.sin(r) + dy * Math.cos(r);
      }

      const local = toLayoutBox(cx, cy, b);
      // matrix is translateY(off) · rotateX(tilt) · scale(k), then the browser divides by z
      const rx0 = (local.x - b.width / 2) * camScale;
      const ry0 = (local.y - b.height / 2) * camScale;
      const z = ry0 * sinT;
      const ry = ry0 * cosT + camOffset;
      const persp = PERSPECTIVE / Math.max(200, PERSPECTIVE - z);

      return { x: b.left + b.width / 2 + rx0 * persp, y: b.top + b.height / 2 + ry * persp };
    },
  }));

  const upright = rotation ? `rotate(${-rotation})` : "";
  const uprightAt = (x: number, y: number) => (rotation ? `rotate(${-rotation} ${x} ${y})` : undefined);
  // a flat-top hex image inside a spun hex window needs up to 1.158x to cover it;
  // the requirement peaks every 30 degrees and returns to 1 every 60
  const artScale = 1 + 0.079 * (1 - Math.cos((rotation * Math.PI) / 30));

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const size = v.size * factor;
        const b = wrapRef.current?.getBoundingClientRect();
        if (!b || tilt > 8) return clampView({ ...v, size });
        const px = (e.clientX - b.left) / b.width;
        const py = (e.clientY - b.top) / b.height;
        const cx = v.x + px * v.size;
        const cy = v.y + py * v.size;
        return clampView({ x: cx - px * size, y: cy - py * size, size });
      });
    },
    [tilt],
  );

  const movedRef = useRef(false);
  const captured = useRef(false);
  const downPos = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    /* Deliberately NOT capturing here. Pointer capture redirects every later
       pointer event to the capturing element, which means the per-hex
       onPointerUp handlers below never fire and tapping a tile does nothing.
       Capture is taken lazily in onPointerMove, once a real drag starts. */
    captured.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    downPos.current = { x: e.clientX, y: e.clientY };
    // hold Shift (or turn Orbit on) to spin the board instead of sliding it
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
      orbit: Boolean(orbitMode) || e.shiftKey || e.button === 2,
    };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        midY: (a.y + b.y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (
      Math.abs(e.clientX - downPos.current.x) + Math.abs(e.clientY - downPos.current.y) > 18
    ) {
      movedRef.current = true;
      // now that it is definitely a drag and not a tap, take the pointer so a
      // re-rendered child cannot drop it mid-gesture
      if (!captured.current) {
        captured.current = true;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
    }

    /* two fingers: pinch to zoom, twist to spin */
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const midY = (a.y + b.y) / 2;
      if (gesture.current) {
        const ratio = gesture.current.dist / Math.max(1, dist);
        if (Math.abs(1 - ratio) > 0.004) {
          setView((v) => {
            const size = v.size * ratio;
            const cx = v.x + v.size / 2;
            const cy = v.y + v.size / 2;
            return clampView({ x: cx - size / 2, y: cy - size / 2, size });
          });
        }
        let dA = angle - gesture.current.angle;
        if (dA > 180) dA -= 360;
        if (dA < -180) dA += 360;
        // twist was geared 2.6x and spun away from under your fingers
        if (Math.abs(dA) > 0.6) onOrbit?.(dA * 1.05, 0);
        // both fingers sliding up or down pitches the camera, the way every
        // map app behaves. Before this the only way to tilt was the slider.
        const dY = midY - gesture.current.midY;
        if (Math.abs(dY) > 0.6) onOrbit?.(0, dY);
      }
      gesture.current = { dist, angle, midY };
      movedRef.current = true;
      return;
    }

    if (pointers.current.size !== 1 || !drag.current) return;

    /* one finger: orbit or pan */
    if (drag.current.orbit) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      onOrbit?.(dx, dy);
      return;
    }

    const b = wrapRef.current?.getBoundingClientRect();
    if (!b) return;
    const sx = view.size / b.width / camScale;
    const sy = sx / Math.max(0.3, cosT); // vertical travel covers more board once pitched
    setView(
      clampView({
        x: drag.current.vx - (e.clientX - drag.current.x) * sx,
        y: drag.current.vy - (e.clientY - drag.current.y) * sy,
        size: view.size,
      }),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (captured.current) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      captured.current = false;
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const teamColor = (teamId?: string) =>
    teamId ? state.teams[teamId]?.config.color ?? "#888" : "#888";

  const tilted = tilt > 8;
  const dragging = pointers.current.size > 0;

  return (
    <div className="board-3d" ref={wrapRef} data-tilted={tilted ? "1" : undefined} data-sky={sky && sky !== "none" ? "1" : undefined} data-drag={dragging ? "1" : undefined} data-orbit={orbitMode ? "1" : undefined}>
      {sky && sky !== "none" && (
        <Sky360
          env={sky}
          rotation={rotation}
          tilt={tilt}
          width={box.w}
          height={box.h}
          perspective={PERSPECTIVE}
        />
      )}
      <Props3D
        state={state}
        view={view}
        rotation={rotation}
        tilt={tilt}
        camScale={camScale}
        camOffset={camOffset}
        width={box.w}
        height={box.h}
        perspective={PERSPECTIVE}
      />
      <svg
        ref={svgRef}
        className="hexboard"
        style={{ transform: `translateY(${camOffset}px) rotateX(${tilt}deg) scale(${camScale})` }}
        viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {SLOTS.map((s) => {
            const c = slotCenter(s);
            return (
              <clipPath id={`clip-${s.col}-${s.row}`} key={slotKey(s)}>
                <polygon points={hexPoints(c.x, c.y, HEX_W - 10, HEX_H - 9)} />
              </clipPath>
            );
          })}
          <filter id="softglow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="tileLift" x="-40%" y="-40%" width="200%" height="220%">
            <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>

        <g transform={rotation ? `rotate(${rotation} ${MID} ${MID})` : undefined}>
          <image href="assets/map.webp" x="0" y="0" width={MAP_SIZE} height={MAP_SIZE} />

          {SLOTS.map((s) => {
            const key = slotKey(s);
            const tile = state.tiles[key];
            if (!tile) return null;
            const c = slotCenter(s);
            const card = CARD_BY_ID[tile.cardId];
            const isBase = tile.cardId.startsWith("BASE");
            const deck = deckOf(tile.cardId) ?? "green";
            const art = tile.faceDown ? DECK_BACK[deck] : card?.art ?? DECK_BACK[deck];
            const popClass = tile.faceDown || isBase ? "tile-pop" : "tile-flip";
            const ownerColor = tile.placedByTeamId
              ? state.teams[tile.placedByTeamId]?.config.color ?? "#ffd75a"
              : "#ffd75a";
            return (
              <g key={`tile-${key}-${tile.cardId}-${tile.faceDown ? "fd" : "up"}`}>
                {isBase && (
                  <polygon
                    className="base-glow"
                    points={hexPoints(c.x, c.y, HEX_W + 8, HEX_H + 7)}
                    fill="none"
                    stroke={ownerColor}
                    strokeWidth={6}
                    filter="url(#softglow)"
                  />
                )}
                <g filter={tilted ? "url(#tileLift)" : undefined}>
                  <g className={popClass} clipPath={`url(#clip-${s.col}-${s.row})`}>
                    <g
                      transform={
                        rotation
                          ? `translate(${c.x} ${c.y}) rotate(${-rotation}) scale(${artScale}) translate(${-c.x} ${-c.y})`
                          : undefined
                      }
                    >
                      <image
                        href={art}
                        x={c.x - (HEX_W - 10) / 2}
                        y={c.y - (HEX_H - 9) / 2}
                        width={HEX_W - 10}
                        height={HEX_H - 9}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </g>
                    {tile.disabled && (
                      <g>
                        <polygon
                          points={hexPoints(c.x, c.y, HEX_W - 10, HEX_H - 9)}
                          fill="rgba(20,20,20,0.55)"
                        />
                        <text
                          x={c.x}
                          y={c.y + 8}
                          textAnchor="middle"
                          fontSize="26"
                          fill="#ff6b6b"
                          transform={uprightAt(c.x, c.y)}
                        >
                          {tile.disabled === "construction" ? "🚫🔨" : tile.disabled === "production" ? "🚫⚙️" : "🚫"}
                        </text>
                      </g>
                    )}
                  </g>
                </g>
                {isBase && (
                  <g transform={uprightAt(c.x, c.y)}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <circle
                        key={i}
                        className="particle"
                        cx={c.x - 52 + i * 15}
                        cy={c.y + 34}
                        r={1.8 + (i % 3)}
                        fill={ownerColor}
                        style={{
                          animationDuration: `${2.2 + (i % 4) * 0.55}s`,
                          animationDelay: `${i * 0.35}s`,
                        }}
                      />
                    ))}
                  </g>
                )}
                <polygon
                  className="place-ring"
                  points={hexPoints(c.x, c.y, HEX_W - 4, HEX_H - 3)}
                  fill="none"
                  stroke={ownerColor}
                  strokeWidth={8}
                  filter="url(#softglow)"
                />
              </g>
            );
          })}

          {EDGES.map((e) => {
            const key = edgeKey(e.a, e.b);
            const wall = state.walls[key];
            const selectable = mode === "edit" && wallMode;
            if (!wall && !selectable) return null;
            return (
              <g
                key={`edge-${key}`}
                className={edgeAlert?.has(key) ? "edge-alert" : undefined}
                transform={`translate(${e.mid.x} ${e.mid.y})`}
                onPointerUp={() => {
                  if (mode === "edit" && !movedRef.current) onSelect?.({ kind: "edge", key });
                }}
                style={{ cursor: selectable ? "pointer" : "default" }}
              >
                {wall ? (
                  <>
                    <g transform={`rotate(${e.angle})`} filter={tilted ? "url(#tileLift)" : undefined}>
                      <image
                        href="assets/wall.webp"
                        x={-52}
                        y={-8.5}
                        width={104}
                        height={17}
                        preserveAspectRatio="none"
                      />
                    </g>
                    <g transform={upright || undefined}>
                      <circle cx={0} cy={0} r={10} fill={teamColor(wall.teamId)} stroke="#181410" strokeWidth={2} opacity={0.92} />
                      <text x={0} y={4.5} textAnchor="middle" fontSize="13" fill="#fff" fontWeight={700}>
                        {wall.durability}
                      </text>
                    </g>
                  </>
                ) : (
                  <rect
                    x={-34}
                    y={-9}
                    width={68}
                    height={18}
                    rx={4}
                    transform={`rotate(${e.angle})`}
                    fill={selectedKey === key ? "rgba(255,215,90,0.9)" : "rgba(217,165,33,0.28)"}
                    stroke="rgba(217,165,33,0.55)"
                    strokeDasharray="6 4"
                  />
                )}
              </g>
            );
          })}

          {SLOTS.map((s) => {
            const key = slotKey(s);
            const c = slotCenter(s);
            const bridges = state.bridges[key] ?? [];
            const chars = state.teamOrder.filter((tid) => state.teams[tid].characterAt === key);
            return (
              <g key={`ov-${key}`}>
                {highlight?.has(key) && (
                  <polygon
                    className="move-target"
                    points={hexPoints(c.x, c.y, HEX_W - 2, HEX_H - 2)}
                    fill="rgba(127,201,138,0.16)"
                    stroke="#7FC98A"
                    strokeWidth={5}
                  />
                )}
                {selectedKey === key && (
                  <polygon
                    points={hexPoints(c.x, c.y, HEX_W + 6, HEX_H + 5)}
                    fill="none"
                    stroke="#ffd75a"
                    strokeWidth={6}
                  />
                )}
                {bridges.map((b, i) => (
                  <g
                    key={b.id}
                    transform={`translate(${c.x + (i - (bridges.length - 1) / 2) * 34} ${c.y - 14}) ${upright}`}
                    filter={tilted ? "url(#tileLift)" : undefined}
                  >
                    <rect x={-16} y={-11} width={32} height={22} rx={5}
                      fill={b.type === "metal" ? "#8d99ae" : "#a9743f"}
                      stroke={teamColor(b.teamId)} strokeWidth={3} />
                    <text x={0} y={5} textAnchor="middle" fontSize="13" fill="#191512">
                      {b.type === "metal" ? "🌉" : "🪵"}{b.durability}
                    </text>
                  </g>
                ))}
                {chars.map((tid, i) => (
                  <g
                    key={tid}
                    transform={`translate(${c.x + (i - (chars.length - 1) / 2) * 30} ${c.y + 26}) ${upright}`}
                    filter={tilted ? "url(#tileLift)" : undefined}
                  >
                    <ellipse cx={0} cy={14} rx={16} ry={5} fill="#000" opacity={0.4} />
                    <circle r={16} fill={teamColor(tid)} stroke="#181410" strokeWidth={3} />
                    <circle r={16} fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.45} />
                    <text x={0} y={5} textAnchor="middle" fontSize="15" fill="#fff" fontWeight={700}>
                      {state.teams[tid].config.name.slice(0, 1).toUpperCase()}
                    </text>
                  </g>
                ))}
                <polygon
                  points={hexPoints(c.x, c.y, HEX_W, HEX_H)}
                  fill="transparent"
                  stroke="none"
                  onPointerUp={() => {
                    if (mode === "edit" && !wallMode && !movedRef.current)
                      onSelect?.({ kind: "slot", key, slot: s });
                  }}
                  style={{
                    cursor: mode === "edit" && !wallMode ? "pointer" : "default",
                    pointerEvents: wallMode ? "none" : "auto",
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="board-haze" aria-hidden />
    </div>
  );
});

export default HexBoard;
