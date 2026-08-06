import { useEffect, useState } from "react";
import type { DerivedState } from "../types";
import { outcome } from "../data/progress";
import { economyHealth } from "../data/rules";
import { sfx, unlockAudio } from "../audio/sfx";

/**
 * The ending.
 *
 * A training game that just stops is a training game with no debrief hook, so
 * this does two jobs: it lands the moment for the room, and it puts the
 * numbers the facilitator needs on screen while everyone is still looking at
 * it — final production, upkeep and net for every team.
 *
 * Derived from the log, so undo un-ends the game.
 */
export default function Outcome({ state }: { state: DerivedState }) {
  const result = outcome(state);
  const [dismissed, setDismissed] = useState(false);
  const over = result.kind !== "playing";

  useEffect(() => {
    if (!over) {
      setDismissed(false);
      return;
    }
    unlockAudio();
    if (result.kind === "won") {
      sfx.round?.();
      window.setTimeout(() => sfx.approve?.(), 320);
    } else {
      sfx.crumble?.();
    }
  }, [over, result.kind]);

  if (!over || dismissed) return null;
  const won = result.kind === "won";

  return (
    <div className={won ? "ending won" : "ending lost"} role="dialog" aria-modal="true">
      <div className="ending-card">
        <span className="ending-kicker">
          {won ? "Golden Gate" : "Round " + state.round}
        </span>
        <h1>{result.headline}</h1>
        <p className="ending-detail">{result.detail}</p>

        {won && result.winners.length > 0 && (
          <div className="ending-winners">
            {result.winners.map((tid) => (
              <span
                key={tid}
                className="ending-team"
                style={{ "--team": state.teams[tid]?.config.color } as React.CSSProperties}
              >
                {state.teams[tid]?.config.name ?? tid}
              </span>
            ))}
          </div>
        )}

        <div className="ending-table">
          <div className="ending-row head">
            <span>Team</span>
            <span>Production</span>
            <span>Upkeep</span>
            <span>Net</span>
          </div>
          {state.teamOrder.map((tid) => {
            const h = economyHealth(state, tid);
            const t = state.teams[tid];
            if (!t) return null;
            return (
              <div
                className="ending-row"
                key={tid}
                style={{ "--team": t.config.color } as React.CSSProperties}
              >
                <span className="ending-name">{t.config.name}</span>
                <span>{h.production}🧱</span>
                <span>{h.maintenance}🧱</span>
                <span className={h.net >= 0 ? "gain" : "loss"}>
                  {h.net >= 0 ? "+" : ""}
                  {h.net}
                </span>
              </div>
            );
          })}
        </div>

        <div className="ending-debrief">
          <b>Debrief</b>
          <p>
            {won
              ? "Which decision bought the most room later? Where did somebody hold back on purpose, and what did that make possible?"
              : "At which round did expansion first outrun production minus maintenance? What was the last moment a different call would have changed it?"}
          </p>
        </div>

        <button className="primary" onClick={() => setDismissed(true)}>
          Back to the board
        </button>
        <span className="muted small">
          The ending stays true to the log — undo reopens the game.
        </span>
      </div>
    </div>
  );
}
