import type { DerivedState, ProposalRecord } from "../types";
import { neighbors } from "../data/board";
import { parseSlot } from "../data/rules";
import { deckOf, distanceToBase, isUnidentified } from "../data/gates";
import { CARD_BY_ID } from "../data/catalog";

/**
 * What the Leader is actually approving.
 *
 * A one-line summary told them a Cartographer wanted to place something
 * somewhere, which is not enough to make a judgement — the whole point of the
 * approval rule is that somebody checks the decision, and you cannot check a
 * placement you cannot see. This draws the hex in question with its six
 * neighbours, so the Leader can tell at a glance whether it connects to their
 * territory, sits next to a hazard, or is stranded in open ground.
 */

const DECK_COLOUR: Record<string, string> = {
  green: "#4E8C5A",
  orange: "#C97A38",
  red: "#9E262C",
  endgame: "#E3B24A",
  base: "#8C7B63",
};

/** Pull the slot a proposal concerns, if it concerns one. */
export function proposalSlot(pr: ProposalRecord): string | null {
  for (const item of pr.items) {
    const slot = item.payload["slot"];
    if (typeof slot === "string") return slot;
    const edge = item.payload["edge"];
    if (typeof edge === "string") return edge.split("|")[0];
  }
  return null;
}

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
}

export default function ProposalPreview({
  state,
  pr,
}: {
  state: DerivedState;
  pr: ProposalRecord;
}) {
  const slot = proposalSlot(pr);
  if (!slot || !slot.includes(",")) return null;

  const centre = parseSlot(slot);
  const ring = neighbors(centre);
  const R = 26;
  const W = 200;
  const H = 180;

  /* axial-ish placement for a flat-top neighbourhood: the six around one */
  const spots = [
    { x: W / 2, y: H / 2 },
    ...ring.map((_, i) => {
      const a = (Math.PI / 180) * (60 * i - 90);
      return { x: W / 2 + R * 1.78 * Math.cos(a), y: H / 2 + R * 1.78 * Math.sin(a) };
    }),
  ];
  const cells = [{ key: slot, target: true }, ...ring.map((n) => ({ key: `${n.col},${n.row}`, target: false }))];

  const dist = distanceToBase(state, centre, state.mode, pr.teamId);
  const target = state.tiles[slot];

  /* what the Cartographer wants to put down */
  const placing = pr.items.find((i) => i.type === "tile/place");
  const placingDeck = placing ? deckOf(String(placing.payload["cardId"] ?? "")) : undefined;

  return (
    <div className="prop-preview">
      <svg viewBox={`0 0 ${W} ${H}`} className="prop-map" aria-label={`Hex ${slot} and its neighbours`}>
        {cells.map((c, i) => {
          const t = state.tiles[c.key];
          const deck = t ? deckOf(t.cardId) : undefined;
          const known = t && !isUnidentified(t.cardId) && !t.faceDown;
          const fill = t ? DECK_COLOUR[deck ?? "green"] ?? "#555" : "rgba(255,255,255,0.045)";
          return (
            <g key={c.key}>
              <polygon
                points={hexPath(spots[i].x, spots[i].y, R)}
                fill={fill}
                fillOpacity={t ? (known ? 0.85 : 0.4) : 1}
                stroke={c.target ? "#E3B24A" : "rgba(255,255,255,0.14)"}
                strokeWidth={c.target ? 3 : 1.2}
              />
              {t && !known && (
                <text x={spots[i].x} y={spots[i].y + 4} className="prop-glyph">
                  🂠
                </text>
              )}
              {known && (
                <text x={spots[i].x} y={spots[i].y + 4} className="prop-code">
                  {t.cardId.startsWith("BASE") ? "BASE" : t.cardId}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <ul className="prop-facts">
        <li>
          <b>Hex {slot}</b>
        </li>
        {placingDeck && (
          <li>
            Placing a <b style={{ color: DECK_COLOUR[placingDeck] }}>{placingDeck}</b> card,
            face-down
          </li>
        )}
        {target && !placing && (
          <li>
            Currently{" "}
            <b>
              {isUnidentified(target.cardId) || target.faceDown
                ? "face-down"
                : CARD_BY_ID[target.cardId]?.title ?? target.cardId}
            </b>
          </li>
        )}
        <li>
          {!Number.isFinite(dist)
            ? "No Base on the map yet"
            : `${dist} ${dist === 1 ? "hex" : "hexes"} from the nearest Base`}
        </li>
        <li>
          {ring.filter((n) => state.tiles[`${n.col},${n.row}`]).length} of 6 neighbours already
          have a card
        </li>
      </ul>
    </div>
  );
}
