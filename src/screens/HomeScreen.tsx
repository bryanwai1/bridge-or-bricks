import { useStore } from "../state/store";
import { actInfo } from "../data/progress";
import { RULES } from "../data/rules";
import { sfx, unlockAudio } from "../audio/sfx";

/**
 * The front door.
 *
 * Every load lands here, even when a session is already running. Walking
 * straight into the map on refresh was disorienting in a room: a facilitator
 * who reopened the tab had no idea whether they were resuming the live game
 * or looking at something stale, and no obvious way back out to start again.
 *
 * This is deliberately NOT persisted. Any page load shows it, which is what
 * "always the first page" has to mean for a device that gets closed and
 * reopened between sessions.
 */
export default function HomeScreen({
  joinTeamId,
  onEnter,
  onGuide,
}: {
  joinTeamId: string | null;
  onEnter: () => void;
  onGuide: () => void;
}) {
  const { state, sync } = useStore();
  const live = state.created;
  const team = joinTeamId ? state.teams[joinTeamId] : undefined;
  const info = live ? actInfo(state) : null;

  const enter = () => {
    unlockAudio();
    sfx.tap();
    onEnter();
  };


  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <span className="home-kicker">A team-building game of expansion, economy and risk</span>
          <h1>Bridge or Bricks</h1>
          <p className="home-rule">
            Your expansion rate must never exceed your production rate minus your
            maintenance cost.
          </p>
        </header>

        {live ? (
          <div className="home-card live">
            <span className="home-tag">
              <i className={`home-dot ${sync}`} /> Session in progress
            </span>

            <div className="home-stats">
              <div>
                <b>{state.teamOrder.length}</b>
                <span>teams</span>
              </div>
              <div>
                <b>{state.phase === "planning" ? "—" : state.round}</b>
                <span>{state.phase === "planning" ? "planning" : "round"}</span>
              </div>
              <div>
                <b>{Object.keys(state.tiles).length}</b>
                <span>tiles down</span>
              </div>
              <div>
                <b>{info?.act ?? 1}</b>
                <span>act</span>
              </div>
            </div>

            {info && <p className="home-act">{info.label}</p>}

            <div className="home-teams">
              {state.teamOrder.map((tid) => (
                <span
                  key={tid}
                  className="home-team"
                  style={{ "--team": state.teams[tid]?.config.color } as React.CSSProperties}
                >
                  {state.teams[tid]?.config.name}
                </span>
              ))}
            </div>

            {team && (
              <p className="home-joining">
                Joining as <b style={{ color: team.config.color }}>{team.config.name}</b>
              </p>
            )}

            <button className="primary home-go" onClick={enter}>
              {joinTeamId ? "Join the table →" : "Continue the session →"}
            </button>
          </div>
        ) : (
          <div className="home-card">
            <span className="home-tag">No session yet</span>
            <p className="muted">
              Set up the teams, hand out the join codes, and build the world together in
              the Planning Phase. {RULES.actionsPerTeamPerRound} actions per team per round.
            </p>
            <button className="primary home-go" onClick={enter}>
              Set up a new session →
            </button>
          </div>
        )}


        <button className="chip home-guide" onClick={onGuide}>
          ❓ How to play
        </button>
      </div>
    </div>
  );
}
