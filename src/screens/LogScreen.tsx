import { useStore } from "../state/store";
import { CARD_BY_ID } from "../data/catalog";

function describe(evType: string, payload: Record<string, unknown>, note?: string): string {
  if (note) return note;
  switch (evType) {
    case "tile/place":
      return `Placed ${CARD_BY_ID[payload.cardId as string]?.title ?? payload.cardId} at ${payload.slot}`;
    case "tile/remove":
      return `Removed tile at ${payload.slot}`;
    case "resource/change":
      return `${(payload.delta as number) > 0 ? "+" : ""}${payload.delta} ${payload.resource}`;
    case "wall/place":
      return `Wall built at ${payload.edge}`;
    case "character/move":
      return `Character moved to ${payload.slot}`;
    case "tile/reveal":
      return `Card revealed at ${payload.slot}`;
    case "proposal/submit":
      return `📨 Proposal: ${payload.summary}`;
    case "proposal/approve":
      return "✅ Proposal approved";
    case "proposal/reject":
      return "❌ Proposal rejected";
    case "order/set":
      return "🎲 Turn order drawn";
    case "turn/next":
      return "▶ Next team";
    default:
      return evType;
  }
}

export default function LogScreen() {
  const { events, state, undo, canUndo, exportSession, resetSession } = useStore();

  return (
    <div className="stack">
      <div className="row wrap">
        <button className="chip" onClick={undo} disabled={!canUndo}>
          ↩️ Undo
        </button>
        <button className="chip" onClick={exportSession}>
          💾 Export session
        </button>
        <button
          className="chip danger"
          onClick={() => {
            if (confirm("End this session and clear all events? Export first if you want to keep it.")) resetSession();
          }}
        >
          🗑 New session
        </button>
      </div>
      <div className="card log-list">
        {[...events].reverse().map((e) => (
          <div className="log-row" key={e.id}>
            <span className="muted small">
              #{e.seq} · {new Date(e.at).toLocaleTimeString()} ·{" "}
              {e.actorTeamId ? state.teams[e.actorTeamId]?.config.name : "Table"}
              {e.actorRole ? ` (${e.actorRole})` : ""}
            </span>
            <span>{describe(e.type, e.payload, e.note)}</span>
          </div>
        ))}
        {events.length === 0 && <p className="muted">No events yet.</p>}
      </div>
    </div>
  );
}
