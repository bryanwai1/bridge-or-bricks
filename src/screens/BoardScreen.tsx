import { useRef, useState } from "react";
import HexBoard, { type BoardHandle, type BoardSelection } from "../components/HexBoard";
import CardReveal, { type RevealOrigin } from "../components/CardReveal";
import CardRing from "../components/CardRing";
import { CARDS, CARD_BY_ID, DECKS, type CardDef } from "../data/catalog";
import { deckGate, deckOf, type DeckGate } from "../data/gates";
import { RULES, canAfford, canMoveTo, costLabel, isActivated, type CostBag } from "../data/rules";
import { sfx, unlockAudio } from "../audio/sfx";
import { useStore } from "../state/store";
import type { ResourceKind } from "../types";

/** Camera presets. 0 is the printed mat seen from directly above. */
const CAMERAS = [
  { deg: 0, label: "Top", hint: "Straight down — matches the printed mat" },
  { deg: 30, label: "Raised", hint: "Slight pitch, still easy to read" },
  { deg: 48, label: "Angled", hint: "Table view — depth without losing the far rows" },
  { deg: 62, label: "Low", hint: "Down at table level, most dramatic" },
];

const costItems = (teamId: string, cost: CostBag, label: string) =>
  (Object.entries(cost) as [ResourceKind, number][]).map(([resource, amount]) => ({
    type: "resource/change" as const,
    payload: { teamId, resource, delta: -amount },
    note: `${label}: −${amount} ${resource}`,
  }));

export default function BoardScreen() {
  const { state, identity, append, appendGroup } = useStore();
  const [sel, setSel] = useState<BoardSelection | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const [pickerDeck, setPickerDeck] = useState<CardDef["deck"]>("green");
  const [query, setQuery] = useState("");
  const [reveal, setReveal] = useState<{ cardId: string; slot: string; subtitle: string; origin: RevealOrigin | null } | null>(null);
  const boardRef = useRef<BoardHandle | null>(null);
  const [rotation, setRotation] = useState(0);
  const [tilt, setTilt] = useState(() => Number(localStorage.getItem("bob-tilt") ?? 0));
  const [showCam, setShowCam] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [sky, setSky] = useState(() => localStorage.getItem("bob-sky") ?? "assets/sky.webp");

  /** Drag deltas from the board: sideways spins, vertical drops the camera. */
  const onOrbit = (dx: number, dy: number) => {
    cancelAnimationFrame(anim.current);
    if (dx) setRotation((r) => (r + dx * 0.26 + 360) % 360);
    if (dy) {
      setTilt((t) => {
        const next = Math.max(0, Math.min(68, t + dy * 0.17));
        localStorage.setItem("bob-tilt", String(Math.round(next)));
        return next;
      });
    }
  };

  /* Camera moves are eased in JS, not CSS. A CSS transition would animate only
     the SVG mat while the WebGL layers snap, and the two would visibly part
     company for half a second on every move. */
  const anim = useRef(0);
  const glide = (toTilt: number, toRot: number) => {
    cancelAnimationFrame(anim.current);
    const step = () => {
      let done = true;
      setTilt((t) => {
        const d = toTilt - t;
        if (Math.abs(d) > 0.15) { done = false; return t + d * 0.18; }
        return toTilt;
      });
      setRotation((r) => {
        let d = ((toRot - r + 540) % 360) - 180;
        if (Math.abs(d) > 0.15) { done = false; return (r + d * 0.18 + 360) % 360; }
        return (toRot + 360) % 360;
      });
      if (!done) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const setCamera = (deg: number) => {
    localStorage.setItem("bob-tilt", String(deg));
    sfx.tap();
    glide(deg, rotation);
  };

  const canEditBoard = identity.role === "cartographer" || identity.role === "facilitator";
  const canEditWalls =
    identity.role === "quartermaster" ||
    identity.role === "cartographer" ||
    identity.role === "facilitator";
  const isFacilitator = identity.role === "facilitator";

  const teamId = identity.teamId ?? state.teamOrder[0];
  const team = state.teams[teamId];
  const tile = sel?.kind === "slot" ? state.tiles[sel.key] : undefined;
  const wall = sel?.kind === "edge" ? state.walls[sel.key] : undefined;
  const bridges = sel?.kind === "slot" ? state.bridges[sel.key] ?? [] : [];

  const close = () => setSel(null);
  const have = team?.resources ?? { brick: 0, supply: 0, metal: 0 };

  const gates: Partial<Record<CardDef["deck"], DeckGate>> = {};
  if (sel?.kind === "slot" && sel.slot) {
    for (const d of DECKS) gates[d.key] = deckGate(state, d.key, sel.slot, teamId);
  }

  const placeCard = (c: CardDef, slot: string) => {
    unlockAudio();
    sfx.place();
    const faceDown = c.deck !== "base";
    append(
      "tile/place",
      { slot, cardId: c.id, teamId, faceDown },
      { note: faceDown ? `Placed a face-down ${c.deck} card at ${slot}` : `Placed ${c.title}` },
    );
    close();
  };

  const openReveal = (cardId: string, slot: string, subtitle: string) => {
    const origin = boardRef.current?.getSlotScreenPos(slot) ?? null;
    setReveal({ cardId, slot, subtitle, origin });
  };

  const explore = (slot: string) => {
    unlockAudio();
    const cardId = state.tiles[slot]?.cardId;
    appendGroup([
      {
        type: "action/log",
        payload: { action: "explore" },
        note: `${team?.config.name ?? "Team"}: 🔭 Explore — revealed the card at ${slot}`,
      },
      { type: "token/use", payload: { teamId } },
      { type: "tile/reveal", payload: { slot } },
    ]);
    if (cardId) openReveal(cardId, slot, `${team?.config.name ?? "Team"} explored hex ${slot}`);
    close();
  };

  const buildBridge = (kind: "wood" | "metal", slot: string) => {
    const spec = kind === "wood" ? RULES.woodBridge : RULES.metalBridge;
    if (!canAfford(have, spec.cost)) return sfx.denied();
    unlockAudio();
    sfx.build();
    appendGroup([
      ...costItems(teamId, spec.cost, `${kind} bridge`),
      {
        type: "bridge/place",
        payload: { slot, bridgeType: kind, teamId, durability: spec.durability },
        note: `${kind === "wood" ? "🪵" : "🌉"} ${kind} bridge built · ${costLabel(spec.cost)} · durability ${spec.durability}`,
      },
    ]);
  };

  const tileDeck = tile ? deckOf(tile.cardId) ?? "green" : "green";
  const tileFaceDown = Boolean(tile?.faceDown);
  const tileCard = tile ? CARD_BY_ID[tile.cardId] : undefined;

  const pickerCards = query
    ? CARDS.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : CARDS.filter((c) => c.deck === pickerDeck);
  const activeDeckColor = DECKS.find((d) => d.key === pickerDeck)?.color ?? "#d9a521";
  const activeCam = CAMERAS.reduce((best, c) => (Math.abs(c.deg - tilt) < Math.abs(best.deg - tilt) ? c : best), CAMERAS[0]);

  return (
    <div className="board-screen">
      {reveal && (
        <CardReveal
          cardId={reveal.cardId}
          origin={reveal.origin}
          subtitle={reveal.subtitle}
          onResolveAction={() => {
            append("tile/remove", { slot: reveal.slot }, {
              note: `Action card resolved and removed — hex ${reveal.slot} is open again`,
            });
            setReveal(null);
          }}
          onClose={() => setReveal(null)}
        />
      )}

      {state.phase === "planning" && (
        <div className="banner planning">
          📐 Planning Phase — place Bases face-up anywhere, then the starting Green cards
          face-down, spread across the map rather than clustered near bases. Cartographers place,
          Leaders approve. The facilitator ends planning from the Actions tab.
        </div>
      )}

      <div className="board-toolbar">
        <button
          className={wallMode ? "chip active" : "chip"}
          onClick={() => {
            sfx.tap();
            setWallMode(!wallMode);
            setSel(null);
          }}
          disabled={!canEditWalls}
        >
          🧱 Wall mode
        </button>
        <button
          className={orbit ? "chip active" : "chip"}
          onClick={() => { sfx.tap(); setOrbit((o) => !o); }}
          title="Drag the board to spin it and change the camera height"
        >
          🔄 Orbit
        </button>
        <span className="muted small">
          {orbit
            ? "Drag to spin · drag up and down to raise or lower the camera"
            : wallMode
              ? "Tap a gap between tiles to build or clear a wall"
              : canEditBoard
                ? "Tap a hex to place a tile · pinch to zoom · twist to spin"
                : "View only — switch to Cartographer to edit"}
        </span>
      </div>

      <div className="board-wrap">
        <HexBoard
          ref={boardRef}
          state={state}
          mode={canEditBoard || canEditWalls ? "edit" : "view"}
          wallMode={wallMode}
          selectedKey={sel?.key ?? null}
          onSelect={(s) => setSel(s)}
          rotation={rotation}
          tilt={tilt}
          orbitMode={orbit}
          onOrbit={onOrbit}
          sky={sky}
        />

        {/* camera pitch */}
        <div className={showCam ? "cam-panel open" : "cam-panel"}>
          <button className="bctl cam-toggle" onClick={() => { setShowCam((s) => !s); sfx.tap(); }} title="Camera angle">
            🎥
          </button>
          {showCam && (
            <div className="cam-body">
              <b className="small">Camera · {activeCam.label}</b>
              <div className="cam-presets">
                {CAMERAS.map((c) => (
                  <button
                    key={c.deg}
                    className={Math.abs(tilt - c.deg) < 3 ? "chip active" : "chip"}
                    onClick={() => setCamera(c.deg)}
                    title={c.hint}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={68}
                step={1}
                value={tilt}
                onChange={(e) => { cancelAnimationFrame(anim.current); setTilt(Number(e.target.value)); }}
                onPointerUp={() => localStorage.setItem("bob-tilt", String(tilt))}
                aria-label="Camera pitch"
              />
              <span className="muted small">{activeCam.hint}</span>
              <button
                className={sky ? "chip active" : "chip"}
                onClick={() => {
                  const next = sky ? "" : "assets/sky.webp";
                  setSky(next);
                  localStorage.setItem("bob-sky", next);
                  sfx.tap();
                }}
              >
                {sky ? "🌅 World on" : "🌑 World off"}
              </button>
              <button className="chip" onClick={() => { sfx.tap(); boardRef.current?.fitBoard(); glide(0, 0); }}>
                Reset view
              </button>
            </div>
          )}
        </div>

        <div className="board-controls">
          <button className="bctl" onClick={() => boardRef.current?.zoomBy(1 / 1.22)} title="Zoom in">＋</button>
          <button className="bctl" onClick={() => boardRef.current?.zoomBy(1.22)} title="Zoom out">－</button>
          <button className="bctl" onClick={() => { sfx.tap(); boardRef.current?.fitBoard(); }} title="Fit the board">⛶</button>
          <button className="bctl" onClick={() => { sfx.tap(); glide(tilt, Math.round(rotation / 90) * 90 - 90); }} title="Turn anti-clockwise">⟲</button>
          <button className="bctl" onClick={() => { sfx.tap(); glide(tilt, Math.round(rotation / 90) * 90 + 90); }} title="Turn clockwise">⟳</button>
        </div>
      </div>

      {/* wall edge */}
      {sel?.kind === "edge" && (
        <div className="sheet">
          <div className="row spread">
            <b>Wall slot</b>
            <button className="chip" onClick={close}>✕</button>
          </div>
          {wall ? (
            <>
              <p>
                Wall — {state.teams[wall.teamId]?.config.name ?? "?"} · durability {wall.durability}
                <span className="muted small"> · decays 1 per round, cannot be repaired</span>
              </p>
              <div className="row wrap">
                <button
                  className="chip danger"
                  disabled={have.supply < 1}
                  onClick={() => {
                    unlockAudio();
                    sfx.crumble();
                    appendGroup([
                      ...costItems(teamId, RULES.demolishWallCost, "Demolish wall"),
                      { type: "wall/remove", payload: { edge: sel.key }, note: "Wall demolished · 1📦" },
                    ]);
                    close();
                  }}
                >
                  Demolish · 1📦
                </button>
                {isFacilitator && (
                  <button
                    className="chip"
                    onClick={() => append("wall/durability", { edge: sel.key, delta: -1 }, { note: "Wall damaged" })}
                  >
                    −1 durability
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="row">
              <button
                className="primary"
                disabled={!canAfford(have, RULES.wall.cost)}
                onClick={() => {
                  unlockAudio();
                  sfx.build();
                  appendGroup([
                    ...costItems(teamId, RULES.wall.cost, "Wall"),
                    {
                      type: "wall/place",
                      payload: { edge: sel.key, teamId, durability: RULES.wall.durability },
                      note: `🧱 Wall built · ${costLabel(RULES.wall.cost)} · lasts ${RULES.wall.durability} rounds`,
                    },
                  ]);
                  close();
                }}
              >
                Build wall · {costLabel(RULES.wall.cost)} · lasts {RULES.wall.durability} rounds
              </button>
            </div>
          )}
        </div>
      )}

      {/* empty hex → the turntable */}
      {sel?.kind === "slot" && !tile && (
        <div className="picker-overlay">
          <div className="picker-head">
            <b>⬢ Hex {sel.key}</b>
            <button className="chip" onClick={close}>✕</button>
          </div>
          <input
            className="card-search"
            placeholder="🔍 Search card title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <CardRing
            cards={pickerCards}
            deckColor={activeDeckColor}
            isLocked={(c) => Boolean(gates[c.deck]?.locked) && !isFacilitator}
            onPlace={(c) => placeCard(c, sel.key)}
          />

          {!query && gates[pickerDeck]?.locked ? (
            <p className="gate-msg center">
              {gates[pickerDeck]?.reason}
              {isFacilitator && <span className="muted"> · facilitator may override</span>}
            </p>
          ) : (
            <p className="muted small center">
              Drag to spin the deck · tap the lit card to place it
              {query ? "" : pickerDeck === "base" ? " (face-up)" : " (face-down 🂠)"}
            </p>
          )}

          <div className="picker-decks">
            {DECKS.map((d) => {
              const locked = Boolean(gates[d.key]?.locked);
              return (
                <button
                  key={d.key}
                  className={
                    (pickerDeck === d.key && !query ? "chip deck active" : "chip deck") +
                    (locked ? " locked" : "")
                  }
                  style={{ "--deck": d.color } as React.CSSProperties}
                  onClick={() => {
                    sfx.tap();
                    setPickerDeck(d.key);
                    setQuery("");
                  }}
                >
                  <span className="dot" style={{ background: d.color }} />
                  {locked ? `🔒 ${d.label}` : d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* occupied hex */}
      {sel?.kind === "slot" && tile && (
        <div className="sheet">
          <div className="row spread">
            <b>
              Hex {sel.key} — {tileFaceDown ? `🂠 face-down ${tileDeck} card` : tileCard?.title ?? tile.cardId}
            </b>
            <button className="chip" onClick={close}>✕</button>
          </div>

          {tileFaceDown ? (
            <>
              <p className="muted small">
                Hidden until a team spends an Explore action — reveal at range, no move needed.
                Action cards resolve on reveal and then leave the map.
              </p>
              <div className="row wrap">
                <button className="primary" onClick={() => explore(sel.key)}>
                  🔭 Explore and reveal · 1 action
                </button>
                {isFacilitator && (
                  <button
                    className="chip"
                    onClick={() => {
                      const cardId = tile.cardId;
                      append("tile/reveal", { slot: sel.key }, { note: `Card at ${sel.key} flipped (facilitator)` });
                      openReveal(cardId, sel.key, "Flipped by the facilitator");
                      close();
                    }}
                  >
                    Flip without spending an action
                  </button>
                )}
                <button
                  className="chip danger"
                  onClick={() => {
                    append("tile/remove", { slot: sel.key }, { note: "Tile removed" });
                    close();
                  }}
                >
                  Remove tile
                </button>
              </div>
            </>
          ) : (
            <>
              {tileCard?.effectText && <p className="muted small">{tileCard.effectText}</p>}
              {!isActivated(tile, teamId) && !tile.cardId.startsWith("BASE") && (
                <p className="rv-tag">Unclaimed — it pays your team nothing until a piece stands here</p>
              )}
              {!canMoveTo(state, teamId, sel.key).ok && (
                <p className="muted small">🚫 {canMoveTo(state, teamId, sel.key).reason}</p>
              )}

              <div className="row wrap">
                <button className="chip" onClick={() => openReveal(tile.cardId, sel.key, `Hex ${sel.key}`)}>
                  🔎 Show on screen
                </button>
                {(() => {
                  const check = canMoveTo(state, teamId, sel.key);
                  const claimed = isActivated(tile, teamId);
                  return (
                    <button
                      className={check.ok ? "chip" : "chip"}
                      disabled={!check.ok}
                      title={check.reason}
                      onClick={() => {
                        unlockAudio();
                        sfx.tap();
                        append("character/move", { teamId, slot: sel.key }, {
                          note: `${team?.config.name ?? "Team"} moved to ${sel.key}${claimed ? "" : " — tile claimed"}`,
                        });
                      }}
                    >
                      🚶 {claimed ? "Move here" : "Move here and claim it"}
                    </button>
                  );
                })()}
              </div>

              {tile.cardId === "GR05" && !tile.settled && (
                <button
                  className="primary"
                  disabled={!canAfford(have, RULES.nomadSettleCost)}
                  onClick={() => {
                    unlockAudio();
                    sfx.texture.drums(3);
                    appendGroup([
                      ...costItems(teamId, RULES.nomadSettleCost, "Settle Nomad Tribe"),
                      {
                        type: "tile/settle",
                        payload: { slot: sel.key, teamId },
                        note: "🏕 Nomad Tribe settled — +1🧱 every round from now on",
                      },
                    ]);
                  }}
                >
                  Settle the tribe · {costLabel(RULES.nomadSettleCost)} → +1🧱 per round
                </button>
              )}
              {tile.cardId === "GR05" && tile.settled && (
                <p className="rv-tag">🏕 Settled — producing 1🧱 each round</p>
              )}

              <div className="row wrap">
                <button
                  className="chip"
                  disabled={!canAfford(have, RULES.woodBridge.cost)}
                  onClick={() => buildBridge("wood", sel.key)}
                >
                  🪵 Wood bridge · {costLabel(RULES.woodBridge.cost)} · dur {RULES.woodBridge.durability}
                </button>
                <button
                  className="chip"
                  disabled={!canAfford(have, RULES.metalBridge.cost)}
                  onClick={() => buildBridge("metal", sel.key)}
                >
                  🌉 Metal bridge · {costLabel(RULES.metalBridge.cost)} · dur {RULES.metalBridge.durability}
                </button>
              </div>

              {bridges.length > 0 && (
                <div className="row wrap">
                  {bridges.map((b) => (
                    <span className="chip static" key={b.id}>
                      {b.type === "metal" ? "🌉" : "🪵"} {b.durability}
                      <button className="mini" onClick={() => append("bridge/durability", { slot: sel.key, bridgeId: b.id, delta: -1 }, { note: "Bridge damaged" })}>−</button>
                      <button className="mini" onClick={() => append("bridge/durability", { slot: sel.key, bridgeId: b.id, delta: 1 }, { note: "Bridge repaired" })}>+</button>
                      <button
                        className="mini danger"
                        onClick={() => {
                          sfx.crumble();
                          append("bridge/remove", { slot: sel.key, bridgeId: b.id }, { note: "Bridge removed" });
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="row wrap">
                <button
                  className="chip"
                  onClick={() =>
                    append("tile/disable", { slot: sel.key, disabled: tile.disabled === "production" ? null : "production" }, { note: "Toggled production disabled" })
                  }
                >
                  🚫⚙️ Production off
                </button>
                <button
                  className="chip"
                  onClick={() =>
                    append("tile/disable", { slot: sel.key, disabled: tile.disabled === "construction" ? null : "construction" }, { note: "Toggled construction disabled" })
                  }
                >
                  🚫🔨 Building off
                </button>
                <button
                  className="chip danger"
                  onClick={() => {
                    append("tile/remove", { slot: sel.key }, { note: "Tile removed" });
                    close();
                  }}
                >
                  Remove tile
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
