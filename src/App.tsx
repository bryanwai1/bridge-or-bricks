import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "./state/store";
import Setup from "./screens/Setup";
import JoinScreen from "./screens/JoinScreen";
import BoardScreen from "./screens/BoardScreen";
import TeamScreen from "./screens/TeamScreen";
import ActionsScreen from "./screens/ActionsScreen";
import LogScreen from "./screens/LogScreen";
import ReferenceScreen from "./screens/ReferenceScreen";
import ProjectorScreen from "./screens/ProjectorScreen";
import ShareScreen from "./screens/ShareScreen";
import GuideScreen from "./screens/GuideScreen";
import type { RoleType } from "./types";
import Backdrop from "./theme/Backdrop";
import ThemeHud from "./theme/ThemeHud";
import Outcome from "./components/Outcome";
import { currentActFrom } from "./data/progress";
import { setAct } from "./theme/ambience";

type Tab = "board" | "team" | "actions" | "log" | "cards" | "share" | "projector";

const ROLE_TAB: Record<RoleType, Tab> = {
  cartographer: "board",
  quartermaster: "team",
  leader: "actions",
  negotiator: "actions",
  follower: "board",
  facilitator: "board",
};

const JOIN_TEAM = new URLSearchParams(location.search).get("team");

function Shell() {
  const { state, identity, setIdentity, undo, canUndo, sync } = useStore();

  /* The Act is a fact about the table, not a setting. Opening the first
     Orange card moves the whole app to Act II; the first Red to Act III.
     theme.css and the canvas Backdrop both read <html data-act>, so the
     palette, the world and the ambience bed turn together. */
  const act = currentActFrom(state);
  useEffect(() => {
    setAct(act);
  }, [act]);
  const [tab, setTab] = useState<Tab>(() =>
    JOIN_TEAM ? "board" : "board",
  );
  const [showGuide, setShowGuide] = useState(false);

  if (showGuide) return <GuideScreen onClose={() => setShowGuide(false)} />;

  // Phone join flow: ?team=... and no team identity chosen yet on this device
  if (JOIN_TEAM && identity.teamId !== JOIN_TEAM) {
    return <JoinScreen teamId={JOIN_TEAM} onGuide={() => setShowGuide(true)} />;
  }

  if (!state.created) return <Setup onGuide={() => setShowGuide(true)} />;

  const isFacilitator = identity.role === "facilitator";
  const ALL_TABS: { key: Tab; label: string }[] = [
    { key: "board", label: "🗺 Board" },
    { key: "team", label: "⬢ Team" },
    { key: "actions", label: "🎯 Actions" },
    { key: "log", label: "📜 Log" },
    { key: "cards", label: "🃏 Cards" },
    ...(isFacilitator ? [{ key: "share" as Tab, label: "📱 Share" }] : []),
    { key: "projector", label: "📽 Projector" },
  ];
  // Phone (QR-joined) devices only see what their role needs
  const PHONE_TABS: Record<RoleType, Tab[]> = {
    cartographer: ["board", "cards"],
    quartermaster: ["team", "board"],
    leader: ["actions", "board", "log"],
    negotiator: ["actions", "board"],
    follower: ["board"],
    facilitator: ALL_TABS.map((t) => t.key),
  };
  const TABS = JOIN_TEAM
    ? ALL_TABS.filter((t) => PHONE_TABS[identity.role].includes(t.key))
    : ALL_TABS;

  const identityOptions: { key: string; label: string; teamId: string | null; role: RoleType }[] = [];
  if (!JOIN_TEAM) {
    identityOptions.push({ key: "fac", label: "🎓 Facilitator (all teams)", teamId: null, role: "facilitator" });
  }
  for (const tid of state.teamOrder) {
    if (JOIN_TEAM && tid !== JOIN_TEAM) continue;
    const t = state.teams[tid];
    if (t.config.members.length === 0) {
      for (const r of ["cartographer", "quartermaster", "leader", "negotiator", "follower"] as RoleType[]) {
        identityOptions.push({ key: `${tid}-${r}`, label: `${t.config.name} — ${r}`, teamId: tid, role: r });
      }
    } else {
      for (const m of t.config.members) {
        identityOptions.push({
          key: `${tid}-${m.id}`,
          label: `${t.config.name} — ${m.name} (${m.role})`,
          teamId: tid,
          role: m.role,
        });
      }
    }
  }
  const currentKey =
    identityOptions.find((o) => o.teamId === identity.teamId && o.role === identity.role)?.key ??
    identityOptions[0]?.key;

  const syncBadge =
    sync === "connected" ? "🟢" : sync === "connecting" ? "🟡" : "🔴";

  if (tab === "projector") {
    return (
      <div className="app projector-mode">
        <Outcome state={state} />
        <ProjectorScreen />
        <button className="chip float-exit" onClick={() => setTab(ROLE_TAB[identity.role])}>
          ← back
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <Outcome state={state} />
      <header className="topbar">
        <select
          className="identity"
          value={currentKey}
          onChange={(e) => {
            const opt = identityOptions.find((o) => o.key === e.target.value);
            if (opt) {
              setIdentity({ teamId: opt.teamId, role: opt.role });
              setTab(ROLE_TAB[opt.role]);
            }
          }}
        >
          {identityOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <span title={`sync: ${sync}`}>{syncBadge}</span>
        <span className="muted small">{state.phase === "planning" ? "📝" : `R${state.round}`}</span>
        <button className="chip" onClick={() => setShowGuide(true)} title="How to play">
          ❓
        </button>
        <button className="chip" onClick={undo} disabled={!canUndo}>
          ↩️
        </button>
      </header>

      <main className="content">
        {tab === "board" && <BoardScreen />}
        {tab === "team" && <TeamScreen />}
        {tab === "actions" && <ActionsScreen />}
        {tab === "log" && <LogScreen />}
        {tab === "cards" && <ReferenceScreen />}
        {tab === "share" && <ShareScreen />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab active" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Backdrop />
      <Shell />
      <ThemeHud />
    </StoreProvider>
  );
}
