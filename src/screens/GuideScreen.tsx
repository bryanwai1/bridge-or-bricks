import { useState } from "react";

type Section = "story" | "roles" | "resources" | "moves" | "win";

const NAV: { key: Section; icon: string; label: string }[] = [
  { key: "story", icon: "📖", label: "The Idea" },
  { key: "roles", icon: "🎭", label: "Roles" },
  { key: "resources", icon: "🧱", label: "Resources" },
  { key: "moves", icon: "🎯", label: "Moves" },
  { key: "win", icon: "🏆", label: "How to Win" },
];

const STORY = [
  { icon: "🏕", title: "Start at your Base", text: "Your team places its home camp anywhere on the map — position is strategy." },
  { icon: "🗺", title: "Act 1 — Grow (Green)", text: "Cards land face-down — a hidden world everyone builds together. Explore to reveal terrain; connected tiles make Bricks each round." },
  { icon: "🧱", title: "Produce & build", text: "Spend Bricks on bridges to cross terrain and walls to defend it." },
  { icon: "🔥", title: "Acts 2 & 3 — Survive (Orange → Red)", text: "As the map grows, Orange pressure arrives, then Red disasters converge. Walls and smart planning keep you alive." },
  { icon: "✨", title: "Find the Golden Gate", text: "Spend Supply to search the End Game deck. Find the Gate — and get there first!" },
];

const ROLES = [
  { icon: "🗺", name: "Cartographer", text: "Places tiles, bridges & pieces in the app — mirrors the real board." },
  { icon: "📦", name: "Quartermaster", text: "Guards the team's resources and walls. Keeps the counts honest." },
  { icon: "🎯", name: "Leader", text: "Commits the team's 3 actions each turn. The final call is theirs." },
  { icon: "🤝", name: "Negotiator", text: "Talks to other teams — trades, truces, alliances… or betrayals." },
  { icon: "👀", name: "Follower", text: "Watches the live board and advises the team." },
];

const RESOURCES = [
  { icon: "🧱", name: "Brick", text: "Your main currency. Tiles connected to your Base produce it every round. Spend it to build." },
  { icon: "📦", name: "Supply", text: "Flexibility! Removes walls (1), and opens End Game draws (1 each). Trade 2 Bricks for 1." },
  { icon: "⚙️", name: "Metal", text: "Advanced material — needed for Metal Bridges to cross Valleys." },
  { icon: "🛡", name: "Durability", text: "Every structure has a lifespan: Wood Bridge 🛡2 · Metal Bridge 🛡4 · Wall 🛡2. Bridges can be maintained — walls crumble on their own after 2 rounds." },
];

const MOVES = [
  { icon: "🎴", name: "Draw & Place", text: "Take a Green or Orange card, place it FACE-DOWN. Green: anywhere. Orange: 4+ tiles from home base" },
  { icon: "🔭", name: "Explore", text: "Spyglass! Flip open any covered card — without going there. Scout, then decide: head there or avoid it" },
  { icon: "♟", name: "Move", text: "Travel your piece across opened tiles (bridges needed for rivers & valleys)" },
  { icon: "⚖️", name: "Trade", text: "2 Bricks ↔ 1 Supply at a Trading Post" },
  { icon: "🪵", name: "Build Bridge", text: "Wood 2🧱·🛡2 crosses Rivers · Metal 1🧱+1⚙️·🛡4 crosses Valleys" },
  { icon: "🧱", name: "Build Wall", text: "Block animals & enemies · 1🧱 · lasts 2 rounds" },
  { icon: "🛠", name: "Maintain", text: "Pay your bridges' upkeep (1🧱 each) — skip it and they crumble" },
];

const GATES = [
  { icon: "🟢", text: "Setup: 6 Green cards start face-down — anywhere. Everyone builds one shared world." },
  { icon: "🟠", text: "Orange joins from the start — but only 4+ tiles from home base." },
  { icon: "🔴", text: "Red unlocks after 4 Orange cards are opened." },
  { icon: "✨", text: "End Game unlocks after 3 Red cards are opened." },
  { icon: "⚡", text: "Flip an Action card? It strikes immediately — local or global — then leaves the map." },
];

export default function GuideScreen({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("story");

  return (
    <div className="guide">
      <div className="guide-hexbg" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ghex" style={{ left: `${8 + i * 14}%`, animationDelay: `${i * 1.1}s`, animationDuration: `${9 + (i % 3) * 3}s` }}>⬡</span>
        ))}
      </div>

      <div className="guide-head">
        <b>How to Play</b>
        <button className="chip" onClick={onClose}>✕</button>
      </div>

      <div className="guide-body" key={section}>
        {section === "story" && (
          <>
            <h2 className="g-title">Bridge or Bricks <span className="g-sub">in 5 steps</span></h2>
            {STORY.map((s, i) => (
              <div className="g-step" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                <span className="g-num">{i + 1}</span>
                <span className="g-icon">{s.icon}</span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
            <div className="g-golden g-step" style={{ animationDelay: "0.7s" }}>
              ⚖️ <b>The golden rule:</b> never grow faster than you can maintain — or everything collapses.
            </div>
          </>
        )}

        {section === "roles" && (
          <>
            <h2 className="g-title">Every player has a job</h2>
            {ROLES.map((r, i) => (
              <div className="g-step" key={r.name} style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="g-icon">{r.icon}</span>
                <div>
                  <b>{r.name}</b>
                  <p>{r.text}</p>
                </div>
              </div>
            ))}
            <p className="muted small center g-step" style={{ animationDelay: "0.55s" }}>
              Scan your team's QR code, enter the PIN, pick your role — your phone shows only what you need.
            </p>
          </>
        )}

        {section === "resources" && (
          <>
            <h2 className="g-title">Four things to watch</h2>
            {RESOURCES.map((r, i) => (
              <div className="g-step" key={r.name} style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="g-icon">{r.icon}</span>
                <div>
                  <b>{r.name}</b>
                  <p>{r.text}</p>
                </div>
              </div>
            ))}
            <div className="g-rates g-step" style={{ animationDelay: "0.5s" }}>
              <span className="chip static">2 🧱 = 1 📦</span>
              <span className="chip static">1 📦 = 💥 wall</span>
              <span className="chip static">1 📦 = 🎴 draw</span>
            </div>
          </>
        )}

        {section === "moves" && (
          <>
            <h2 className="g-title">
              3 actions per team, per turn
            </h2>
            <div className="g-tokens g-step">
              <span className="g-token" /> <span className="g-token" style={{ animationDelay: "0.3s" }} /> <span className="g-token" style={{ animationDelay: "0.6s" }} />
            </div>
            <p className="center muted small g-step">Your whole team shares them — decide together!</p>
            {MOVES.map((m, i) => (
              <div className="g-step g-move" key={m.name} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <span className="g-icon sm">{m.icon}</span>
                <b>{m.name}</b>
                <span className="muted">{m.text}</span>
              </div>
            ))}
            <h2 className="g-title g-step" style={{ animationDelay: "0.75s" }}>How the map unfolds</h2>
            {GATES.map((g, i) => (
              <div className="g-step g-move" key={i} style={{ animationDelay: `${0.8 + i * 0.08}s` }}>
                <span className="g-icon sm">{g.icon}</span>
                <span className="muted">{g.text}</span>
              </div>
            ))}
            <div className="g-step g-golden" style={{ animationDelay: "0.8s" }}>
              🛠 <b>Maintenance:</b> each round, pay 1 🧱 per bridge you own — an unpaid bridge
              loses 1 🛡. <b>Walls can't be maintained: they crumble after 2 rounds</b> — rebuild
              if you still need them. At 0 🛡 a structure collapses.
              <span className="g-playtest">bridge upkeep: playtest</span>
            </div>
            <p className="muted small center g-step" style={{ animationDelay: "0.9s" }}>
              After all teams act: tiles produce → maintenance is paid → effects resolve. New round!
            </p>
          </>
        )}

        {section === "win" && (
          <>
            <h2 className="g-title">Reaching the end</h2>
            <div className="g-step g-wincard gold" style={{ animationDelay: "0s" }}>
              <span className="g-icon big">✨</span>
              <div>
                <b>The Golden Gate</b>
                <p>Hidden among 9 End Game cards with decoys and monsters. Each draw costs 1 Supply — and each miss improves the odds: 1/9 → 1/8 → 1/7…</p>
              </div>
            </div>
            <div className="g-step g-wincard" style={{ animationDelay: "0.15s" }}>
              <span className="g-icon">🤝</span>
              <div>
                <b>Collaborative</b>
                <p><b>Everyone</b> must reach and enter the Gate. Win together — or not at all.</p>
              </div>
            </div>
            <div className="g-step g-wincard" style={{ animationDelay: "0.3s" }}>
              <span className="g-icon">⚔️</span>
              <div>
                <b>Competitive</b>
                <p>Once the Gate is revealed, the <b>first team to enter it wins</b>. Position matters!</p>
              </div>
            </div>
            <div className="g-step g-wincard lose" style={{ animationDelay: "0.45s" }}>
              <span className="g-icon">💀</span>
              <div>
                <b>How you lose</b>
                <p>No moves left and no resources = collapse. Overexpansion is the silent killer — maintain what you build.</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="guide-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={section === n.key ? "gnav active" : "gnav"}
            onClick={() => setSection(n.key)}
          >
            <span className="gnav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}
