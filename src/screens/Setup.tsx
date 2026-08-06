import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../state/store";
import { hashPasscode, unlock } from "../data/admin";
import { sessionCode } from "../net/supabase";
import { sfx, unlockAudio } from "../audio/sfx";

/** Browsers stay silent until the first gesture, so every tap unlocks first. */
const tap = () => { unlockAudio(); sfx.tap(); };
import { RULES, costLabel } from "../data/rules";
import type { GameMode, RoleType, TeamConfig } from "../types";

export const MIN_CREW = 2;
export const MAX_CREW = 8;
const DEFAULT_CREW = 4;

const PALETTE: { name: string; hex: string }[] = [
  { name: "Crimson", hex: "#C8524B" },
  { name: "Cobalt", hex: "#4C7FC4" },
  { name: "Moss", hex: "#4E9E6A" },
  { name: "Amber", hex: "#C99A34" },
  { name: "Violet", hex: "#8A5FBF" },
  { name: "Teal", hex: "#3FA9A0" },
  { name: "Ember", hex: "#C4713C" },
  { name: "Rose", hex: "#B84E8C" },
];

/** Four jobs nobody else can do, plus Followers on the bigger teams. */
export const ROLE_CARDS: {
  key: RoleType;
  label: string;
  icon: string;
  can: string[];
  cannot: string;
}[] = [
  {
    key: "leader",
    label: "Leader",
    icon: "👑",
    can: ["Approves every action before it counts", "Spends the team's 3 actions", "Ends the team's turn"],
    cannot: "Cannot place tiles — that's the Cartographer's hand alone.",
  },
  {
    key: "cartographer",
    label: "Cartographer",
    icon: "🗺",
    can: ["The only role that may place a card on the map", "Explores face-down tiles", "Builds bridges and walls"],
    cannot: "Nothing is placed until the Leader approves it.",
  },
  {
    key: "quartermaster",
    label: "Quartermaster",
    icon: "📦",
    can: ["Holds the resource count", "Tracks wall and bridge durability", "Calls the upkeep each round"],
    cannot: "Cannot move the team's piece or place tiles.",
  },
  {
    key: "negotiator",
    label: "Negotiator",
    icon: "🤝",
    can: ["Opens trades and truces with other teams", "Speaks for the team at the table", "Records agreed terms"],
    cannot: "Every deal still needs the Leader's approval.",
  },
  {
    key: "follower",
    label: "Follower",
    icon: "🔭",
    can: ["Scouts ahead and calls the targets", "Argues the case before the Leader decides", "Any number of you"],
    cannot: "No spend authority — advises without being able to commit the team.",
  },
];

/** Fill order as a team grows: the first four are solo, the rest are Followers. */
export function seatsFor(size: number): RoleType[] {
  const core = ROLE_CARDS.slice(0, 4).map((r) => r.key);
  const seats = core.slice(0, Math.min(size, 4));
  for (let i = 4; i < size; i++) seats.push("follower");
  return seats;
}

interface Draft {
  name: string;
  colorIndex: number;
  crew: number;
  picking?: boolean;
}

export default function Setup({ onGuide }: { onGuide?: () => void }) {
  const { state, append, importSession } = useStore();
  const [mode, setMode] = useState<GameMode>("collaborative");
  const [teams, setTeams] = useState<Draft[]>([
    { name: "Crimson", colorIndex: 0, crew: DEFAULT_CREW },
    { name: "Cobalt", colorIndex: 1, crew: DEFAULT_CREW },
  ]);
  const [showRoles, setShowRoles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalPlayers = teams.reduce((a, t) => a + t.crew, 0);
  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState("");

  const patch = (i: number, next: Partial<Draft>) =>
    setTeams((ts) => ts.map((t, j) => (j === i ? { ...t, ...next } : t)));

  const start = async () => {
    if (passcode.trim().length < 4) {
      setPassError("Set a passcode of at least 4 characters — it is the only thing keeping players out of Facilitator.");
      return;
    }
    unlockAudio();
    sfx.round();
    const adminHash = await hashPasscode(passcode);
    // whoever opens the session is already through the gate on this device
    unlock(sessionCode());
    const cfg: TeamConfig[] = teams.map((t, i) => ({
      id: `team-${i + 1}`,
      name: t.name.trim() || `Team ${i + 1}`,
      color: PALETTE[t.colorIndex].hex,
      size: t.crew,
      pin: String(Math.floor(1000 + Math.random() * 9000)),
      members: [],
    }));
    append("session/create", { mode, teams: cfg, planning: true, adminHash }, {
      note: "Session created — Planning Phase begins",
    });
  };

  if (state.created) return <SignInBoard />;

  return (
    <div className="setup">
      <div className="setup-hero rise d1">
        <img src="assets/cards/GREEN-BACK.webp" alt="" className="setup-emblem" />
        <h1>Bridge or Bricks</h1>
        <p className="muted">Set the table, then let each team sign itself in.</p>
        {onGuide && (
          <button className="chip guide-cta" onClick={() => { tap(); onGuide(); }}>
            How to play · 3 min
          </button>
        )}
      </div>

      <div className="card rise d2">
        <h2>Mode</h2>
        <div className="row">
          {(["collaborative", "competitive"] as GameMode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "chip active" : "chip"}
              onClick={() => { tap(); setMode(m); }}
            >
              {m === "collaborative" ? "🤝 Collaborative" : "⚔️ Competitive"}
            </button>
          ))}
        </div>
        <p className="muted small">
          {mode === "collaborative"
            ? "Everyone wins together — the Gate must be found and every team must enter it."
            : "First team through the drawn Gate wins."}
        </p>
      </div>

      <div className="card rise d3">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Teams</h2>
          <button className="chip" onClick={() => { tap(); setShowRoles(true); }}>
            👥 The roles
          </button>
        </div>
        <p className="muted small">
          Two to eight players per team. Tap a team's circle to change its colour, and use
          −&thinsp;/&thinsp;+ to set how many are playing.
        </p>

        {teams.map((t, i) => {
          const used = teams.filter((_, j) => j !== i).map((x) => x.colorIndex);
          return (
            <div
              className={t.picking ? "team-block picking" : "team-block"}
              key={i}
              style={{ "--team": PALETTE[t.colorIndex].hex } as React.CSSProperties}
            >
              <div className="team-row">
                <button
                  className="team-dot"
                  title="Choose colour"
                  onClick={() => {
                    tap();
                    setTeams((ts) => ts.map((x, j) => ({ ...x, picking: j === i ? !x.picking : false })));
                  }}
                />
                <input
                  className="team-name"
                  value={t.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
                <span className="crew">
                  <button
                    className="step"
                    disabled={t.crew <= MIN_CREW}
                    onClick={() => { tap(); patch(i, { crew: t.crew - 1 }); }}
                  >−</button>
                  <span className="crew-seats">
                    {Array.from({ length: t.crew }, (_, s) => <i key={s} className="crew-seat" />)}
                  </span>
                  <span className="crew-n">{t.crew}</span>
                  <button
                    className="step"
                    disabled={t.crew >= MAX_CREW}
                    onClick={() => { tap(); patch(i, { crew: t.crew + 1 }); }}
                  >+</button>
                </span>
                {teams.length > 2 && (
                  <button
                    className="mini danger"
                    onClick={() => setTeams((ts) => ts.filter((_, j) => j !== i))}
                  >✕</button>
                )}
              </div>

              <div className="tray">
                <div className="tray-in">
                  {PALETTE.map((p, ci) => (
                    <button
                      key={p.hex}
                      className={`swatch${ci === t.colorIndex ? " on" : ""}${used.includes(ci) ? " taken" : ""}`}
                      style={{ background: p.hex, color: p.hex }}
                      title={p.name}
                      onClick={() => {
                        tap();
                        patch(i, { colorIndex: ci, name: p.name, picking: false });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <div className="row">
          <button
            className="chip"
            disabled={teams.length >= PALETTE.length}
            onClick={() => {
              tap();
              const used = teams.map((t) => t.colorIndex);
              const free = PALETTE.findIndex((_, i) => !used.includes(i));
              if (free < 0) return;
              setTeams((ts) => [...ts, { name: PALETTE[free].name, colorIndex: free, crew: DEFAULT_CREW }]);
            }}
          >
            + Add team
          </button>
          <span className="muted small">
            {teams.length} teams · <b className="counter">{totalPlayers}</b> players
          </span>
        </div>
      </div>

      <section className="card rise d4">
        <b>🔐 Facilitator passcode</b>
        <p className="muted small">
          Players join by scanning a QR — no password, on purpose. This passcode guards the
          Facilitator role, which overrides the turn order, the deck gates and the placement
          rules, and can see every team's PIN. Write it down; it cannot be recovered.
        </p>
        <input
          className="setup-input"
          type="text"
          autoComplete="off"
          placeholder="Passcode (4+ characters)"
          value={passcode}
          onChange={(e) => {
            setPasscode(e.target.value);
            setPassError("");
          }}
        />
        {passError && <p className="admin-error">{passError}</p>}
      </section>

      <button className="primary rise d4" onClick={start}>Open the session →</button>

      <button className="chip rise d5" onClick={() => fileRef.current?.click()}>
        Import a saved session…
      </button>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSession(f); }} />

      {showRoles && <RoleModal onClose={() => setShowRoles(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RoleModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body wide" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>The roles</h2>
          <button className="chip" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">
          Four jobs nobody else can do, then Followers. Roles fill in order — a team of two
          holds Leader and Cartographer and shares the rest between them.
        </p>
        {ROLE_CARDS.map((r) => (
          <div className="ability" key={r.key}>
            <span className="ability-icon">{r.icon}</span>
            <div>
              <b>{r.label}</b>
              <ul>{r.can.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="muted small">{r.cannot}</p>
            </div>
          </div>
        ))}
        <p className="muted small">
          Costs this session: wall {costLabel(RULES.wall.cost)} · wood bridge {costLabel(RULES.woodBridge.cost)} ·
          metal bridge {costLabel(RULES.metalBridge.cost)} · {RULES.actionsPerTeamPerRound} actions per team per round.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SignInBoard() {
  const { state } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [host, setHost] = useState(location.origin);

  // phones cannot reach "localhost" — ask the relay what this machine is called
  useEffect(() => {
    fetch(`http://${location.hostname}:5200/info`)
      .then((r) => r.json())
      .then((d: { ips?: string[] }) => {
        const ip = d.ips?.[0];
        if (ip && location.hostname === "localhost") setHost(`http://${ip}:${location.port || 5173}`);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="setup">
      <div className="setup-hero rise d1">
        <h1>Sign in</h1>
        <p className="muted">
          Each team's Leader opens their card, then everyone else scans the same code
          and picks a role.
        </p>
      </div>

      <div className="signin-grid rise d2">
        {state.teamOrder.map((tid) => {
          const t = state.teams[tid];
          if (!t) return null;
          const size = t.config.size ?? 4;
          const filled = t.config.members.length;
          return (
            <button
              key={tid}
              className="signin-card"
              style={{ "--team": t.config.color } as React.CSSProperties}
              onClick={() => { tap(); setOpen(tid); }}
            >
              <span className="signin-dot" />
              <b>{t.config.name}</b>
              <span className="signin-count">
                <b className="counter">{filled}</b>/{size} signed in
              </span>
              <span className="signin-seats">
                {seatsFor(size).map((role, i) => {
                  const held = t.config.members.filter((m) => m.role === role);
                  const idx = seatsFor(size).slice(0, i).filter((r) => r === role).length;
                  const who = held[idx];
                  const card = ROLE_CARDS.find((r) => r.key === role);
                  return (
                    <i key={`${role}-${i}`} className={who ? "seat on" : "seat"} title={who?.name ?? card?.label}>
                      {card?.icon}
                    </i>
                  );
                })}
              </span>
              <span className="chip small">Show QR</span>
            </button>
          );
        })}
      </div>

      {open && <QrPopup teamId={open} host={host} onClose={() => setOpen(null)} />}
    </div>
  );
}

function QrPopup({ teamId, host, onClose }: { teamId: string; host: string; onClose: () => void }) {
  const { state } = useStore();
  const t = state.teams[teamId];
  const [png, setPng] = useState("");
  const url = `${host}/?team=${teamId}`;

  useEffect(() => {
    void QRCode.toDataURL(url, { width: 720, margin: 1, color: { dark: "#1a1410", light: "#f6efe0" } }).then(setPng);
  }, [url]);

  if (!t) return null;
  const size = t.config.size ?? 4;

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-body qr-pop"
        style={{ "--team": t.config.color } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <b style={{ color: t.config.color, fontSize: 20 }}>{t.config.name}</b>
          <button className="chip" onClick={onClose}>✕</button>
        </div>
        {png && <img className="qr-img" src={png} alt={`Join ${t.config.name}`} />}
        <div className="qr-pin">
          <span className="muted small">Team PIN</span>
          <b>{t.config.pin}</b>
        </div>
        <p className="muted small center">
          All {size} players scan this. The Leader signs in first and reads the PIN out — then
          each player picks the role they agreed beforehand.
        </p>
        <div className="qr-seats">
          {seatsFor(size).map((role, i) => {
            const held = t.config.members.filter((m) => m.role === role);
            const idx = seatsFor(size).slice(0, i).filter((r) => r === role).length;
            const who = held[idx];
            const card = ROLE_CARDS.find((r) => r.key === role);
            return (
              <div key={`${role}-${i}`} className={who ? "qr-seat on" : "qr-seat"}>
                <span>{card?.icon}</span>
                <b>{card?.label}</b>
                <i>{who ? who.name : "open"}</i>
              </div>
            );
          })}
        </div>
        <code className="qr-url">{url}</code>
      </div>
    </div>
  );
}
