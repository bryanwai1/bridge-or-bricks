import { useState } from "react";
import { useStore } from "../state/store";
import type { ResourceKind } from "../types";
import { sfx, unlockAudio } from "../audio/sfx";

/**
 * The trade desk.
 *
 * "2 Bricks ↔ 1 Supply at a Trading Post" is the bank rate and stays where it
 * is. This is the other kind of trade: one team asking another for something,
 * at a price the two of them argue out. There was no way to do that in the app
 * before — the Negotiator opened a talk and the outcome was typed into a note,
 * so nothing moved and nothing was checked.
 *
 * Now an offer is a real object. Either side can counter as many times as they
 * like; the numbers only move when somebody accepts, and only if both teams
 * can actually cover their side.
 */

const RES: { key: ResourceKind; icon: string; label: string }[] = [
  { key: "brick", icon: "🧱", label: "Brick" },
  { key: "supply", icon: "📦", label: "Supply" },
  { key: "metal", icon: "⚙️", label: "Metal" },
];

type Bag = Partial<Record<ResourceKind, number>>;

const bagLabel = (b: Bag) => {
  const parts = RES.filter((r) => (b[r.key] ?? 0) > 0).map((r) => `${b[r.key]}${r.icon}`);
  return parts.length ? parts.join(" ") : "nothing";
};

const canCover = (have: Record<ResourceKind, number>, b: Bag) =>
  RES.every((r) => (b[r.key] ?? 0) <= (have[r.key] ?? 0));

function Stepper({
  bag,
  onChange,
  max,
}: {
  bag: Bag;
  onChange: (b: Bag) => void;
  max?: Record<ResourceKind, number>;
}) {
  return (
    <div className="trade-steppers">
      {RES.map((r) => {
        const v = bag[r.key] ?? 0;
        const ceiling = max ? max[r.key] ?? 0 : 99;
        return (
          <div className="trade-step" key={r.key}>
            <span className="trade-res">
              {r.icon} {r.label}
            </span>
            <button
              className="chip"
              disabled={v <= 0}
              onClick={() => {
                sfx.tap();
                onChange({ ...bag, [r.key]: Math.max(0, v - 1) });
              }}
            >
              −
            </button>
            <b className={max && v > ceiling ? "over" : undefined}>{v}</b>
            <button
              className="chip"
              onClick={() => {
                sfx.tap();
                onChange({ ...bag, [r.key]: v + 1 });
              }}
            >
              +
            </button>
            {max && <i className="trade-have">of {ceiling}</i>}
          </div>
        );
      })}
    </div>
  );
}

export default function TradeDesk({ teamId }: { teamId: string }) {
  const { state, append } = useStore();
  const me = state.teams[teamId];
  const others = state.teamOrder.filter((t) => t !== teamId);

  const [withTeam, setWithTeam] = useState(others[0] ?? "");
  const [give, setGive] = useState<Bag>({ brick: 2 });
  const [want, setWant] = useState<Bag>({ supply: 1 });
  const [draft, setDraft] = useState<Record<string, { give: Bag; get: Bag }>>({});

  if (!me) return null;

  const live = Object.values(state.trades).filter(
    (t) => t.state === "open" && (t.fromTeamId === teamId || t.toTeamId === teamId),
  );
  const settled = Object.values(state.trades)
    .filter(
      (t) => t.state !== "open" && (t.fromTeamId === teamId || t.toTeamId === teamId),
    )
    .slice(-3);

  const name = (id: string) => state.teams[id]?.config.name ?? id;

  const openOffer = () => {
    if (!withTeam) return;
    unlockAudio();
    sfx.tap();
    const id = `tr-${Date.now().toString(36)}`;
    append(
      "trade/offer",
      { id, fromTeamId: teamId, toTeamId: withTeam, give, get: want },
      { note: `🤝 ${me.config.name} offered ${bagLabel(give)} to ${name(withTeam)} for ${bagLabel(want)}` },
    );
  };

  return (
    <div className="card trade-desk">
      <b>🤝 Trade with another team</b>
      <p className="muted small">
        The Trading Post rate is fixed. This is for deals between teams — set what you'll
        hand over and what you want back, then let them haggle.
      </p>

      {others.length === 0 ? (
        <p className="muted small">No other teams in this session.</p>
      ) : (
        <>
          <label className="trade-with">
            <span className="small">Offer to</span>
            <select value={withTeam} onChange={(e) => setWithTeam(e.target.value)}>
              {others.map((t) => (
                <option key={t} value={t}>
                  {name(t)}
                </option>
              ))}
            </select>
          </label>

          <span className="trade-leg">You give</span>
          <Stepper bag={give} onChange={setGive} max={me.resources} />

          <span className="trade-leg">You want back</span>
          <Stepper bag={want} onChange={setWant} />

          <button
            className="primary"
            disabled={!canCover(me.resources, give) || (!bagLabel(give) && !bagLabel(want))}
            onClick={openOffer}
          >
            Send offer · {bagLabel(give)} → {bagLabel(want)}
          </button>
          {!canCover(me.resources, give) && (
            <p className="admin-error">You don't hold that much to give.</p>
          )}
        </>
      )}

      {live.length > 0 && (
        <div className="trade-live">
          <b className="small">On the table</b>
          {live.map((t) => {
            const mine = t.fromTeamId === teamId;
            const myTurn = t.awaitingTeamId === teamId;
            const iGive = mine ? t.give : t.get;
            const iGet = mine ? t.get : t.give;
            const d = draft[t.id] ?? { give: t.give, get: t.get };
            const other = mine ? t.toTeamId : t.fromTeamId;
            const theirs = state.teams[other];
            const bothCanPay =
              canCover(me.resources, iGive) &&
              Boolean(theirs && canCover(theirs.resources, iGet));

            return (
              <div className={myTurn ? "trade-row mine" : "trade-row"} key={t.id}>
                <span className="trade-summary">
                  <b>{name(other)}</b> — you give {bagLabel(iGive)}, you get {bagLabel(iGet)}
                  {t.rounds > 0 && <i> · countered {t.rounds}×</i>}
                </span>

                {!myTurn ? (
                  <span className="muted small">Waiting on {name(t.awaitingTeamId)}…</span>
                ) : (
                  <>
                    {!bothCanPay && (
                      <span className="admin-error">
                        One side can't cover this yet — counter or wait.
                      </span>
                    )}
                    <div className="trade-actions">
                      <button
                        className="chip good"
                        disabled={!bothCanPay}
                        onClick={() => {
                          unlockAudio();
                          sfx.approve();
                          append(
                            "trade/accept",
                            { id: t.id },
                            { note: `✅ Trade agreed: ${name(t.fromTeamId)} ↔ ${name(t.toTeamId)}` },
                          );
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="chip danger"
                        onClick={() => {
                          sfx.denied();
                          append("trade/decline", { id: t.id }, { note: `❌ Trade declined` });
                        }}
                      >
                        Decline
                      </button>
                    </div>

                    <details className="trade-counter">
                      <summary>Counter</summary>
                      <span className="trade-leg">{name(t.fromTeamId)} gives</span>
                      <Stepper
                        bag={d.give}
                        onChange={(b) => setDraft({ ...draft, [t.id]: { ...d, give: b } })}
                      />
                      <span className="trade-leg">{name(t.fromTeamId)} gets back</span>
                      <Stepper
                        bag={d.get}
                        onChange={(b) => setDraft({ ...draft, [t.id]: { ...d, get: b } })}
                      />
                      <button
                        className="chip"
                        onClick={() => {
                          sfx.tap();
                          append(
                            "trade/counter",
                            { id: t.id, give: d.give, get: d.get },
                            {
                              note: `↔️ ${me.config.name} countered: ${bagLabel(d.give)} for ${bagLabel(d.get)}`,
                            },
                          );
                        }}
                      >
                        Send counter
                      </button>
                    </details>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {settled.length > 0 && (
        <ul className="trade-history">
          {settled.map((t) => (
            <li key={t.id}>
              {t.state === "accepted" ? "✅" : "❌"} {name(t.fromTeamId)} ↔ {name(t.toTeamId)} ·{" "}
              {bagLabel(t.give)} for {bagLabel(t.get)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
