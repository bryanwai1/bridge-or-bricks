import { useMemo, useState } from "react";
import { CARDS, DECKS, type CardDef } from "../data/catalog";

export default function ReferenceScreen() {
  const [q, setQ] = useState("");
  const [deck, setDeck] = useState<CardDef["deck"] | "all">("all");
  const [open, setOpen] = useState<CardDef | null>(null);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return CARDS.filter(
      (c) =>
        (deck === "all" || c.deck === deck) &&
        (!needle ||
          c.title.toLowerCase().includes(needle) ||
          c.id.toLowerCase().includes(needle) ||
          (c.effectText ?? "").toLowerCase().includes(needle)),
    );
  }, [q, deck]);

  return (
    <div className="stack">
      <div className="row wrap">
        <input placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={deck === "all" ? "chip active" : "chip"} onClick={() => setDeck("all")}>
          All
        </button>
        {DECKS.map((d) => (
          <button
            key={d.key}
            className={deck === d.key ? "chip active" : "chip"}
            style={{ borderColor: d.color }}
            onClick={() => setDeck(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="ref-grid">
        {filtered.map((c) => (
          <button className="ref-card" key={c.id} onClick={() => setOpen(c)}>
            <img src={c.art} alt={c.title} loading="lazy" />
            <div>
              <b>
                {c.id} — {c.title}
              </b>
              {c.status !== "confirmed" && <span className={`status ${c.status}`}>{c.status}</span>}
              <p className="small muted">{c.effectText ?? "(no printed text)"}</p>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <img src={open.art} alt={open.title} />
            <h3>
              {open.id} — {open.title}{" "}
              {open.status !== "confirmed" && <span className={`status ${open.status}`}>{open.status}</span>}
            </h3>
            <p>{open.effectText ?? "(no printed text — resolution by rulebook)"}</p>
            {open.scopeText && <p className="muted">{open.scopeText}</p>}
            <p className="small muted">
              Deck: {open.deck} · Copies: {open.copies}
              {open.notes ? ` · ${open.notes}` : ""}
            </p>
            <button className="primary" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
