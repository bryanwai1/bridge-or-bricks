import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { sfx, unlockAudio } from "../audio/sfx";
import type { RoleType } from "../types";

const ROLES: { key: RoleType; label: string; icon: string; blurb: string; solo: boolean }[] = [
  { key: "leader", label: "Leader", icon: "👑", blurb: "Approves everything. Nothing your team does counts until you say yes.", solo: true },
  { key: "cartographer", label: "Cartographer", icon: "🗺", blurb: "The only one who may place tiles on the map.", solo: true },
  { key: "quartermaster", label: "Quartermaster", icon: "📦", blurb: "Keeps the resources and the walls honest.", solo: true },
  { key: "negotiator", label: "Negotiator", icon: "🤝", blurb: "Opens trades and truces with the other teams. Talks are public.", solo: true },
  { key: "follower", label: "Follower", icon: "🔭", blurb: "Scouts, advises, argues. Any number of you.", solo: false },
];

export default function JoinScreen({ teamId, onGuide }: { teamId: string; onGuide?: () => void }) {
  const { state, setIdentity, append } = useStore();
  const team = state.teams[teamId];

  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleType | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const taken = useMemo(() => {
    const map = new Map<RoleType, string>();
    for (const m of team?.config.members ?? []) if (!map.has(m.role)) map.set(m.role, m.name);
    return map;
  }, [team]);

  if (!state.created) {
    return (
      <div className="join">
        <div className="join-card">
          <span className="join-emblem">⬢</span>
          <h1>Not started yet</h1>
          <p className="muted">
            The facilitator hasn't opened the session. Keep this page open — it'll come alive
            when they start.
          </p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="join">
        <div className="join-card">
          <span className="join-emblem">⚠️</span>
          <h1>Team not found</h1>
          <p className="muted">That QR code points at a team that isn't in this session. Ask the facilitator to re-share.</p>
        </div>
      </div>
    );
  }

  const needsPin = Boolean(team.config.pin);

  const join = () => {
    if (!name.trim()) return setError("Put your name in so your team knows who's who.");
    if (!role) return setError("Pick a role.");
    if (needsPin && pin.trim() !== team.config.pin) return setError("That PIN doesn't match. Ask your Leader.");

    unlockAudio();
    sfx.approve();
    const member = {
      id: `${teamId}-${Date.now().toString(36)}`,
      name: name.trim(),
      role,
    };
    append("team/join", { teamId, member }, {
      note: `${member.name} joined ${team.config.name} as ${role}`,
    });
    setIdentity({ teamId, role, memberName: member.name });
  };

  return (
    <div className="join" style={{ "--team": team.config.color } as React.CSSProperties}>
      <div className="join-card">
        <span className="join-emblem">⬢</span>
        <h1>{team.config.name}</h1>
        <p className="muted small">
          {state.mode === "collaborative" ? "Collaborative — everyone wins together" : "Competitive — first team through the Gate wins"}
        </p>

        <label className="join-label">Your name</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="e.g. Aisha"
          autoComplete="given-name"
        />

        <label className="join-label">Your role</label>
        <div className="role-grid">
          {ROLES.map((r) => {
            const heldBy = taken.get(r.key);
            const blocked = r.solo && Boolean(heldBy);
            return (
              <button
                key={r.key}
                className={`role-card${role === r.key ? " on" : ""}${blocked ? " taken" : ""}`}
                onClick={() => {
                  if (blocked) return sfx.denied();
                  sfx.tap();
                  setRole(r.key);
                  setError("");
                }}
              >
                <span className="role-icon">{r.icon}</span>
                <b>{r.label}</b>
                <span className="role-blurb">{blocked ? `Taken by ${heldBy}` : r.blurb}</span>
              </button>
            );
          })}
        </div>

        {needsPin && (
          <>
            <label className="join-label">Team PIN</label>
            <input
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              placeholder="4 digits from your Leader"
              inputMode="numeric"
              maxLength={4}
              className="join-pin"
            />
          </>
        )}

        {error && <p className="join-error">{error}</p>}

        <button className="primary" onClick={join}>Join {team.config.name}</button>

        {team.config.members.length > 0 && (
          <div className="join-roster">
            <span className="muted small">Already in:</span>
            {team.config.members.map((m) => (
              <span key={m.id} className="chip static small">
                {ROLES.find((r) => r.key === m.role)?.icon ?? "•"} {m.name}
              </span>
            ))}
          </div>
        )}

        {onGuide && (
          <button className="chip" onClick={onGuide}>❓ How to play — 2 min</button>
        )}
      </div>
    </div>
  );
}
