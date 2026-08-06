import raw from "../cards.v1.json";

export type RuleStatus = "confirmed" | "playtest" | "proposal" | "unknown" | "retired";

export interface CardDef {
  id: string;
  title: string;
  deck: "green" | "orange" | "red" | "endgame" | "base";
  kind: string;
  copies: number;
  effectText: string | null;
  scopeText: string | null;
  status: RuleStatus;
  icons?: string[];
  notes?: string;
  art: string; // public asset path
}

interface RawCard {
  id: string;
  title: string;
  copies: number;
  kind: string;
  effectText: string | null;
  scopeText: string | null;
  status: RuleStatus;
  icons?: string[];
  notes?: string;
}

const data = raw as unknown as {
  decks: {
    green: { cards: RawCard[]; baseCards: { title: string; copies: number; notes?: string } };
    orange: { cards: RawCard[] };
    red: { cards: RawCard[] };
    endgame: { cards: RawCard[]; accessRule: string };
  };
};

const ART_V = "2"; // bump to cache-bust after re-exporting card assets

function toDef(c: RawCard, deck: CardDef["deck"]): CardDef {
  return { ...c, deck, art: `assets/cards/${c.id}.webp?v=${ART_V}` };
}

export const CARDS: CardDef[] = [
  ...data.decks.green.cards.map((c) => toDef(c, "green")),
  {
    id: "BASE",
    title: "Base Card",
    deck: "base",
    kind: "base",
    copies: 8,
    effectText: "Team origin / headquarters. Production activates for tiles connected to a Base.",
    scopeText: null,
    status: "confirmed",
    art: `assets/cards/BASE.webp?v=${ART_V}`,
    notes: data.decks.green.baseCards.notes,
  },
  ...data.decks.orange.cards.map((c) => toDef(c, "orange")),
  ...data.decks.red.cards.map((c) => toDef(c, "red")),
  ...data.decks.endgame.cards.map((c) => toDef(c, "endgame")),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

export const DECKS: { key: CardDef["deck"]; label: string; color: string }[] = [
  { key: "base", label: "Base", color: "#b3a184" },
  { key: "green", label: "Green", color: "#4e7d3a" },
  { key: "orange", label: "Orange", color: "#c96f3b" },
  { key: "red", label: "Red", color: "#a83232" },
  { key: "endgame", label: "End Game", color: "#7a5fa0" },
];

export const ENDGAME_ACCESS_RULE = data.decks.endgame.accessRule;
