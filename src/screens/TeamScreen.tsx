import { useStore } from "../state/store";
import type { ResourceKind } from "../types";

const RESOURCES: { key: ResourceKind; label: string; icon: string }[] = [
  { key: "brick", label: "Brick", icon: "🧱" },
  { key: "supply", label: "Supply", icon: "📦" },
  { key: "metal", label: "Metal", icon: "⚙️" },
];

export default function TeamScreen() {
  const { state, identity, append } = useStore();
  const teamIds = identity.teamId ? [identity.teamId] : state.teamOrder;

  return (
    <div className="stack">
      {teamIds.map((tid) => {
        const t = state.teams[tid];
        if (!t) return null;
        const walls = Object.values(state.walls).filter((w) => w.teamId === tid).length;
        const bridgeCount = Object.values(state.bridges)
          .flat()
          .filter((b) => b.teamId === tid).length;
        return (
          <div className="card" key={tid}>
            <div className="row spread">
              <b style={{ color: t.config.color }}>⬢ {t.config.name}</b>
              <span className="muted small">
                🌉 {bridgeCount} bridges · 🧱 {walls} walls
              </span>
            </div>

            {RESOURCES.map((r) => (
              <div className="row spread resource-row" key={r.key}>
                <span className="resource-label">
                  {r.icon} {r.label}
                </span>
                <div className="row">
                  <button
                    className="big-btn"
                    onClick={() =>
                      append("resource/change", { teamId: tid, resource: r.key, delta: -1 })
                    }
                  >
                    −
                  </button>
                  <span className="counter">{t.resources[r.key]}</span>
                  <button
                    className="big-btn"
                    onClick={() =>
                      append("resource/change", { teamId: tid, resource: r.key, delta: 1 })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            <div className="row spread resource-row">
              <span className="resource-label">🎯 Actions</span>
              <div className="row">
                <span className="tokens">
                  {Array.from({ length: t.actionTokens.available }).map((_, i) => (
                    <span key={`a${i}`} className="token avail" />
                  ))}
                  {Array.from({ length: t.actionTokens.used }).map((_, i) => (
                    <span key={`u${i}`} className="token used" />
                  ))}
                </span>
                <button
                  className="chip"
                  disabled={t.actionTokens.available === 0}
                  onClick={() => append("token/use", { teamId: tid }, { note: "Action token spent" })}
                >
                  Use
                </button>
                <button
                  className="chip"
                  onClick={() => append("token/refresh", { teamId: tid }, { note: "Action tokens refreshed" })}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
