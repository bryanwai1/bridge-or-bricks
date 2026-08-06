import { useEffect, useRef, useState } from "react";
import HexBoard, { type BoardHandle } from "../components/HexBoard";
import { useStore } from "../state/store";
import {
  RULES,
  economyHealth,
  goldenGateOdds,
  teamProduction,
} from "../data/rules";
import { ENDGAME_UNLOCK_AFTER, RED_UNLOCK_AFTER, revealedCount } from "../data/gates";

const ACT = [
  { key: "green", label: "Act I · Growth", color: "#4e7d3a" },
  { key: "orange", label: "Act II · Pressure", color: "#c96f3b" },
  { key: "red", label: "Act III · Convergence", color: "#a83232" },
];

/**
 * The room-facing display. Everything here is sized for someone forty feet away
 * with their back to the screen half the time: few numbers, big numbers, and
 * whose turn it is readable at a glance.
 */
export default function ProjectorScreen() {
  const { state } = useStore();
  const boardRef = useRef<BoardHandle | null>(null);
  const [tilt, setTilt] = useState(() => Number(localStorage.getItem("bob-proj-tilt") ?? 42));
  const [spin, setSpin] = useState(0);
  const [idle, setIdle] = useState(true);

  /* a slow drift, so a static board on a TV still feels alive */
  useEffect(() => {
    if (!idle) return;
    let raf = 0;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      setSpin(Math.sin(t * 0.06) * 7);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [idle]);

  const orangeOpen = revealedCount(state, "orange");
  const redOpen = revealedCount(state, "red");
  const act = redOpen > 0 ? ACT[2] : orangeOpen > 0 ? ACT[1] : ACT[0];
  const odds = goldenGateOdds(state);
  const gateFound = state.endgameDrawn.includes("EG01");

  const active = state.turnOrder[state.activeTurnIndex];
  const upNext = state.turnOrder[(state.activeTurnIndex + 1) % Math.max(1, state.turnOrder.length)];

  const feed = [...(state.recentNotes ?? [])].slice(-7).reverse();

  return (
    <div className="proj" style={{ "--act": act.color } as React.CSSProperties}>
      <div className="proj-stage">
        <HexBoard
          ref={boardRef}
          state={state}
          mode="view"
          rotation={spin}
          tilt={tilt}
          sky="assets/sky.webp"
        />
        <div className="proj-vignette" aria-hidden />

        <div className="proj-title">
          <h1>Bridge or Bricks</h1>
          <span className="proj-act">{act.label}</span>
        </div>

        {state.phase === "planning" ? (
          <div className="proj-turn planning">
            <span className="proj-turn-label">Planning Phase</span>
            <b>Build the world together</b>
          </div>
        ) : active ? (
          <div className="proj-turn" style={{ "--team": state.teams[active]?.config.color } as React.CSSProperties}>
            <span className="proj-turn-label">Round {state.round} · now playing</span>
            <b>{state.teams[active]?.config.name}</b>
            {upNext && upNext !== active && (
              <span className="proj-next">next · {state.teams[upNext]?.config.name}</span>
            )}
          </div>
        ) : null}

        <div className="proj-ctl">
          <button className="bctl" onClick={() => { setIdle(false); boardRef.current?.zoomBy(1 / 1.2); }}>＋</button>
          <button className="bctl" onClick={() => { setIdle(false); boardRef.current?.zoomBy(1.2); }}>－</button>
          <button className="bctl" onClick={() => boardRef.current?.fitBoard()}>⛶</button>
          <button
            className={idle ? "bctl on" : "bctl"}
            title="Slow drift"
            onClick={() => setIdle((v) => !v)}
          >
            ↻
          </button>
          <input
            className="proj-tilt"
            type="range" min={0} max={66} value={tilt}
            onChange={(e) => {
              setTilt(Number(e.target.value));
              localStorage.setItem("bob-proj-tilt", e.target.value);
            }}
            aria-label="Camera pitch"
          />
        </div>
      </div>

      <aside className="proj-side">
        <div className="proj-teams">
          {state.teamOrder.map((tid) => {
            const t = state.teams[tid];
            if (!t) return null;
            const h = economyHealth(state, tid);
            const prod = teamProduction(state, tid);
            const isActive = tid === active;
            return (
              <div
                key={tid}
                className={isActive ? "pteam live" : "pteam"}
                style={{ "--team": t.config.color } as React.CSSProperties}
              >
                <div className="pteam-head">
                  <b>{t.config.name}</b>
                  <span className={`pteam-net ${h.risk}`}>
                    {h.net >= 0 ? "+" : ""}{h.net}
                  </span>
                </div>
                <div className="pteam-res">
                  <span>🧱 {t.resources.brick}</span>
                  <span>📦 {t.resources.supply}</span>
                  <span>⚙️ {t.resources.metal}</span>
                  <span className="pteam-act">
                    {"●".repeat(t.actionTokens.available)}
                    <i>{"●".repeat(t.actionTokens.used)}</i>
                  </span>
                </div>
                {prod.dormant.length > 0 && (
                  <span className="pteam-warn">
                    {prod.dormant.length} tile{prod.dormant.length === 1 ? "" : "s"} unclaimed
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="proj-gates">
          <div className={redOpen >= ENDGAME_UNLOCK_AFTER ? "pgate open" : "pgate"}>
            <span>Orange opened</span>
            <b>{orangeOpen}<i>/{RULES.redUnlockAfterOrange}</i></b>
          </div>
          <div className={redOpen >= ENDGAME_UNLOCK_AFTER ? "pgate open" : "pgate"}>
            <span>Red opened</span>
            <b>{redOpen}<i>/{ENDGAME_UNLOCK_AFTER}</i></b>
          </div>
          <div className={gateFound ? "pgate gold" : "pgate"}>
            <span>Golden Gate</span>
            <b>{gateFound ? "FOUND" : odds.chance}</b>
          </div>
        </div>

        {feed.length > 0 && (
          <div className="proj-feed">
            {feed.map((n, i) => (
              <p key={i} style={{ opacity: 1 - i * 0.12 }}>{n}</p>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
