import { useState } from "react";
import { roleCanCommit, useStore } from "../state/store";
import { ENDGAME_ACCESS_RULE } from "../data/catalog";
import { ENDGAME_UNLOCK_AFTER, revealedCount } from "../data/gates";
import {
  RULES,
  costLabel,
  drawEndgameCard,
  economyHealth,
  endgameRemaining,
  goldenGateOdds,
  isCollapsed,
  planRound,
  teamProduction,
} from "../data/rules";
import { isMuted, sfx, toggleMute, unlockAudio } from "../audio/sfx";
import CardReveal from "../components/CardReveal";

const ACTIONS = [
  { key: "explore", label: "🔭 Explore — reveal a card at range" },
  { key: "move", label: "🚶 Move" },
  { key: "build-wood-bridge", label: `🪵 Wood bridge · ${costLabel(RULES.woodBridge.cost)}` },
  { key: "build-metal-bridge", label: `🌉 Metal bridge · ${costLabel(RULES.metalBridge.cost)}` },
  { key: "build-wall", label: `🧱 Wall · ${costLabel(RULES.wall.cost)}` },
  { key: "trade", label: `⚖️ Trade · ${costLabel(RULES.tradeGive)} → ${costLabel(RULES.tradeGet)}` },
  { key: "trade-metal", label: `⚙️ Buy Metal · ${costLabel(RULES.metalGive)} → ${costLabel(RULES.metalGet)}` },
  { key: "maintenance", label: "🔧 Maintenance — pay bridge upkeep" },
  { key: "demolish-wall", label: "💥 Demolish wall · 1📦" },
  { key: "other", label: "✏️ Other / custom" },
];

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ActionsScreen() {
  const { state, identity, append, appendGroup } = useStore();
  const teamId = identity.teamId ?? state.teamOrder[0];
  const team = state.teams[teamId];
  const [note, setNote] = useState("");
  const [negTargets, setNegTargets] = useState<string[]>([]);
  const [negTerms, setNegTerms] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [, forceMute] = useState(0);

  const isFacilitator = identity.role === "facilitator";
  const canApprove = roleCanCommit(identity.role);
  const planning = state.phase === "planning";

  const pending = Object.values(state.proposals).filter(
    (pr) => pr.state === "pending" && (isFacilitator || (pr.teamId && pr.teamId === teamId)),
  );
  const myPending = Object.values(state.proposals).filter(
    (pr) => pr.state === "pending" && pr.teamId === identity.teamId,
  );

  const redOpened = revealedCount(state, "red");
  const endgameLocked = redOpened < ENDGAME_UNLOCK_AFTER;
  const odds = goldenGateOdds(state);
  const gateFound = state.endgameDrawn.includes("EG01");

  if (!team) return null;

  const health = economyHealth(state, teamId);
  const plan = planRound(state);

  const logAction = (key: string, label: string) => {
    unlockAudio();
    const items: { type: "action/log" | "token/use" | "resource/change"; payload: Record<string, unknown>; note?: string }[] = [
      { type: "action/log", payload: { action: key }, note: `${team.config.name}: ${label}${note ? ` — ${note}` : ""}` },
      { type: "token/use", payload: { teamId } },
    ];
    if (key === "trade") {
      sfx.coin();
      items.push(
        { type: "resource/change", payload: { teamId, resource: "brick", delta: -2 }, note: "Trade: −2 Bricks" },
        { type: "resource/change", payload: { teamId, resource: "supply", delta: 1 }, note: "Trade: +1 Supply" },
      );
    } else if (key === "trade-metal") {
      sfx.coin();
      items.push(
        { type: "resource/change", payload: { teamId, resource: "brick", delta: -(RULES.metalGive.brick ?? 3) }, note: `Metal: −${RULES.metalGive.brick ?? 3} Bricks` },
        { type: "resource/change", payload: { teamId, resource: "metal", delta: 1 }, note: "Metal: +1" },
      );
    } else if (key === "demolish-wall") {
      sfx.crumble();
      items.push({ type: "resource/change", payload: { teamId, resource: "supply", delta: -1 }, note: "−1 Supply" });
    } else {
      sfx.tap();
    }
    appendGroup(items);
    setNote("");
  };

  /** Production Phase → Maintenance Phase → refresh tokens → next round. One undo step. */
  const resolveRound = () => {
    unlockAudio();
    const { items, production, maintenanceLog } = planRound(state);
    const totalBricks = Object.values(production).reduce((n, p) => n + p.bricks, 0);
    for (let i = 0; i < Math.min(4, totalBricks); i++) sfx.brick(i);
    if (maintenanceLog.length) setTimeout(() => sfx.crumble(), 420);
    setTimeout(() => sfx.round(), 700);

    appendGroup([
      ...items,
      ...state.teamOrder.map((tid) => ({ type: "token/refresh" as const, payload: { teamId: tid } })),
      {
        type: "phase/advance" as const,
        payload: { phase: "actions", round: state.round + 1 },
        note: `Round ${state.round + 1} — production +${totalBricks}🧱 across the table, maintenance resolved, actions refreshed`,
      },
    ]);
    setShowReport(false);
  };

  const drawEndgame = () => {
    unlockAudio();
    const card = drawEndgameCard(state);
    if (!card) {
      sfx.denied();
      return;
    }
    appendGroup([
      { type: "resource/change", payload: { teamId, resource: "supply", delta: -1 }, note: "−1 Supply — End Game draw" },
      { type: "endgame/draw", payload: { cardId: card }, note: `${team.config.name} drew from the End Game deck` },
      { type: "token/use", payload: { teamId } },
    ]);
    setDrawn(card);
  };

  return (
    <div className="stack">
      {drawn && (
        <CardReveal
          cardId={drawn}
          subtitle={`${team.config.name} · ${endgameRemaining(state).length - 1} cards left after this`}
          onClose={() => setDrawn(null)}
        />
      )}

      {planning && (
        <div className="card banner planning">
          <b>📐 Planning Phase</b>
          <p className="muted small">
            Place Bases face-up anywhere, then {RULES.startingGreens} Green cards face-down across
            the map. Cartographers place, Leaders approve. No actions are spent yet.
          </p>
          {isFacilitator && (
            <button
              className="primary"
              onClick={() => {
                unlockAudio();
                sfx.round();
                const order = shuffled(state.teamOrder);
                const names = order
                  .map((tid, i) => `${i + 1}. ${state.teams[tid]?.config.name ?? tid}`)
                  .join(" → ");
                appendGroup([
                  { type: "order/set", payload: { order }, note: `🎲 Turn order drawn: ${names}` },
                  {
                    type: "phase/advance",
                    payload: { phase: "actions", round: 1 },
                    note: "Planning over — Round 1 begins",
                  },
                ]);
              }}
            >
              🎲 Draw turn order and start Round 1
            </button>
          )}
        </div>
      )}

      {/* the core formula, live */}
      {!planning && (
        <div className="card">
          <div className="row spread">
            <b>📈 {team.config.name} economy</b>
            <button
              className="chip sound"
              onClick={() => {
                unlockAudio();
                toggleMute();
                forceMute((n) => n + 1);
                if (!isMuted()) sfx.tap();
              }}
              title={isMuted() ? "Sound off" : "Sound on"}
            >
              {isMuted() ? "🔇" : "🔊"}
            </button>
          </div>
          <div className={`econ ${health.risk}`}>
            <div className="econ-head">
              <span className="small">
                Production {health.production}🧱 − upkeep {health.maintenance}🧱
              </span>
              <span className="econ-net">
                {health.net >= 0 ? "+" : ""}
                {health.net}🧱
              </span>
            </div>
            <div className="econ-bar">
              <div
                className="econ-fill"
                style={{ width: `${Math.max(4, Math.min(100, 50 + health.net * 12))}%` }}
              />
            </div>
            <span className="muted small">{health.message}</span>
          </div>
          {(() => {
            const prod = teamProduction(state, teamId);
            if (prod.dormant.length > 0) {
              return (
                <p className="rv-tag" style={{ margin: "6px auto 0" }}>
                  🚩 {prod.dormant.length} connected tile{prod.dormant.length === 1 ? "" : "s"} pay nothing until
                  you stand on {prod.dormant.length === 1 ? "it" : "them"} — {prod.dormant.map((d) => d.title).join(", ")}
                </p>
              );
            }
            if (prod.lines.length === 0) {
              return (
                <p className="muted small">
                  Nothing is feeding this Base yet. A tile pays only when it is face-up, connected
                  back to your Base, and one of your pieces has stood on it.
                </p>
              );
            }
            return null;
          })()}
          {isCollapsed(state, teamId) && (
            <p className="join-error">⚠️ No resources and no income — this team is at collapse.</p>
          )}
        </div>
      )}

      {state.turnOrder.length > 0 && !planning && (
        <div className="card">
          <div className="row spread">
            <b>🎲 Turn order</b>
            {canApprove && (
              <button
                className="chip"
                onClick={() => {
                  sfx.tap();
                  const next = state.turnOrder[(state.activeTurnIndex + 1) % state.turnOrder.length];
                  append("turn/next", {}, { note: `▶ ${state.teams[next]?.config.name ?? next} is up` });
                }}
              >
                Next team ▶
              </button>
            )}
          </div>
          <div className="turn-order">
            {state.turnOrder.map((tid, i) => {
              const t = state.teams[tid];
              const active = i === state.activeTurnIndex;
              return (
                <span
                  key={tid}
                  className={active ? "chip turn active" : "chip turn"}
                  style={{ "--team": t?.config.color ?? "#888" } as React.CSSProperties}
                >
                  {i + 1}. {t?.config.name ?? tid}
                  {active ? " ◀" : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {canApprove && pending.length > 0 && (
        <div className="card approvals">
          <b>✅ Awaiting your approval ({pending.length})</b>
          {pending.map((pr) => (
            <div className="proposal" key={pr.id}>
              <span className="small">
                <b>{state.teams[pr.teamId ?? ""]?.config.name ?? "?"}</b>
                {pr.role ? ` · ${pr.role}` : ""} — {pr.summary}
              </span>
              <span className="row">
                <button
                  className="chip"
                  onClick={() => {
                    unlockAudio();
                    sfx.approve();
                    append("proposal/approve", { proposalId: pr.id }, { note: `✅ Approved: ${pr.summary}` });
                  }}
                >
                  Approve
                </button>
                <button
                  className="chip danger"
                  onClick={() => {
                    sfx.denied();
                    append("proposal/reject", { proposalId: pr.id }, { note: `❌ Rejected: ${pr.summary}` });
                  }}
                >
                  Reject
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!canApprove && myPending.length > 0 && (
        <div className="card">
          <b>📨 Sent to your Leader</b>
          {myPending.map((pr) => (
            <p className="muted small" key={pr.id}>⏳ {pr.summary}</p>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row spread">
          <b>{team.config.name} — {planning ? "Planning" : `Round ${state.round}`}</b>
          <span className="muted small">
            {team.actionTokens.available}/{team.actionTokens.available + team.actionTokens.used} actions left
          </span>
        </div>
        <input
          placeholder="Optional note (target, tile, details…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="actions-grid">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              className="action-btn"
              disabled={planning || team.actionTokens.available === 0}
              onClick={() => logAction(a.key, a.label)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="muted small">
          Builds and explores are best done from the Board tab — the app deducts the cost and
          checks the placement rules there. Costs marked playtest live in one editable block in
          <code> src/data/rules.ts</code>.
        </p>
      </div>

      <div className="card">
        <b>🌀 End Game deck</b>
        <p className="muted small">
          {ENDGAME_ACCESS_RULE} {odds.left} cards left · Golden Gate odds {odds.chance}.
        </p>
        {gateFound && <p className="rv-tag">🌟 The Golden Gate is out. Teams must now enter it.</p>}
        {endgameLocked && (
          <p className="gate-msg">
            🔒 Unlocks after {ENDGAME_UNLOCK_AFTER} Red cards are opened ({redOpened}/{ENDGAME_UNLOCK_AFTER})
            {isFacilitator ? " · facilitator may override" : ""}
          </p>
        )}
        <button
          className="primary"
          disabled={(endgameLocked && !isFacilitator) || odds.left === 0 || team.resources.supply < 1}
          onClick={drawEndgame}
        >
          Draw a card · 1📦
        </button>
        {team.resources.supply < 1 && !endgameLocked && (
          <p className="muted small">You need 1 Supply to draw.</p>
        )}
        {state.endgameDrawn.length > 0 && (
          <p className="small">
            Drawn: {state.endgameDrawn.filter((c) => c === "EG02").length} decoys
            {state.endgameDrawn.includes("EG03") ? " · Wild Wolves" : ""}
            {state.endgameDrawn.includes("EG04") ? " · Barbarians" : ""}
            {gateFound ? " · 🌟 Golden Gate" : ""}
          </p>
        )}
      </div>

      <div className="card">
        <b>🤝 Negotiation</b>
        <div className="row wrap">
          {state.teamOrder
            .filter((tid) => tid !== teamId)
            .map((tid) => (
              <button
                key={tid}
                className={negTargets.includes(tid) ? "chip active" : "chip"}
                onClick={() =>
                  setNegTargets((cur) =>
                    cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid],
                  )
                }
              >
                {state.teams[tid].config.name}
              </button>
            ))}
          <button
            className="primary"
            disabled={negTargets.length === 0}
            onClick={() => {
              append(
                "negotiation/open",
                { fromTeamId: teamId, withTeamIds: negTargets },
                {
                  note: `${team.config.name} opened negotiation with ${negTargets
                    .map((t) => state.teams[t].config.name)
                    .join(", ")}`,
                },
              );
              setNegTargets([]);
            }}
          >
            Open negotiation 📣
          </button>
        </div>
        {Object.values(state.negotiations)
          .filter((n) => n.state === "opened")
          .map((n) => (
            <div className="row wrap" key={n.id}>
              <span className="small">
                {state.teams[n.openedByTeamId]?.config.name} ↔{" "}
                {n.withTeamIds.map((t) => state.teams[t]?.config.name).join(", ")}
              </span>
              <input
                placeholder="Agreed terms (e.g. 2 brick for 1 supply, truce 2 rounds)"
                value={negTerms}
                onChange={(e) => setNegTerms(e.target.value)}
              />
              <button
                className="chip"
                onClick={() => {
                  sfx.approve();
                  append(
                    "negotiation/close",
                    { negotiationId: n.id, result: "agreed", terms: negTerms },
                    { note: `Deal agreed: ${negTerms || "(terms on table)"}` },
                  );
                  setNegTerms("");
                }}
              >
                Agreed
              </button>
              <button
                className="chip danger"
                onClick={() =>
                  append("negotiation/close", { negotiationId: n.id, result: "declined" }, { note: "Negotiation declined" })
                }
              >
                Declined
              </button>
            </div>
          ))}
        <p className="muted small">
          Teams negotiate face-to-face; the app announces that talks are open and records the
          outcome. Apply agreed swaps on the Team tab.
        </p>
      </div>

      {!planning && canApprove && (
        <div className="card">
          <b>⏭ End of round</b>
          <p className="muted small">
            Runs the Production Phase, then the Maintenance Phase — walls decay, bridge upkeep is
            paid where affordable, and anything at 0 durability is removed. One undo step.
          </p>
          <button className="chip" onClick={() => setShowReport((s) => !s)}>
            {showReport ? "Hide preview" : `Preview — ${plan.items.length} changes`}
          </button>
          {showReport && (
            <div className="round-report">
              {state.teamOrder.map((tid) => {
                const p = plan.production[tid];
                return (
                  <div className="round-line" key={tid}>
                    <span>{state.teams[tid]?.config.name}</span>
                    <span className={p?.bricks ? "gain" : "zero"}>
                      +{p?.bricks ?? 0}🧱 from {p?.lines.filter((l) => l.bricks > 0).length ?? 0} tiles
                    </span>
                  </div>
                );
              })}
              {plan.maintenanceLog.map((m, i) => (
                <div className="round-line" key={`m${i}`}>
                  <span className="muted">{m}</span>
                </div>
              ))}
              {plan.maintenanceLog.length === 0 && (
                <div className="round-line">
                  <span className="muted">All structures hold. No losses this round.</span>
                </div>
              )}
            </div>
          )}
          <button className="primary" onClick={resolveRound}>
            Resolve round {state.round} → start round {state.round + 1}
          </button>
        </div>
      )}
    </div>
  );
}
