import type { DerivedState, GameMode, SlotRef } from "../types";
import { slotKey } from "../types";
import { neighbors } from "./board";
import { CARD_BY_ID, type CardDef } from "./catalog";

// Deck-back art shown while a placed card is face-down (fog-of-war).
export const DECK_BACK: Record<CardDef["deck"], string> = {
  base: "assets/cards/BASE.webp",
  green: "assets/cards/GREEN-BACK.webp",
  orange: "assets/cards/ORANGE-BACK.webp",
  red: "assets/cards/RED-BACK.webp",
  endgame: "assets/cards/EG-BACK.webp",
};

export const ORANGE_MIN_DISTANCE = 4; // tiles from base (confirmed)
export const RED_UNLOCK_AFTER = 4; // Orange cards opened (confirmed)
export const ENDGAME_UNLOCK_AFTER = 3; // Red cards opened (confirmed)

export function deckOf(cardId: string): CardDef["deck"] | undefined {
  if (cardId.startsWith("BASE")) return "base";
  return CARD_BY_ID[cardId]?.deck;
}

/** Map-wide count of face-up (opened) cards of a deck. */
export function revealedCount(state: DerivedState, deck: CardDef["deck"]): number {
  let n = 0;
  for (const t of Object.values(state.tiles)) {
    if (!t.faceDown && deckOf(t.cardId) === deck) n += 1;
  }
  return n;
}

/**
 * Hex distance (in tiles, BFS over the board) from a slot to the nearest
 * relevant Base. Collaborative: any base (the map is built together).
 * Competitive: the placing team's own base (proposal, labeled in UI).
 * Returns Infinity when no relevant base is on the map yet.
 */
export function distanceToBase(
  state: DerivedState,
  slot: SlotRef,
  mode: GameMode,
  teamId?: string,
): number {
  const baseKeys = new Set(
    Object.entries(state.tiles)
      .filter(
        ([, t]) =>
          deckOf(t.cardId) === "base" &&
          (mode === "collaborative" || !teamId || t.placedByTeamId === teamId),
      )
      .map(([k]) => k),
  );
  if (baseKeys.size === 0) return Infinity;
  const start = slotKey(slot);
  if (baseKeys.has(start)) return 0;
  const seen = new Set([start]);
  let frontier: SlotRef[] = [slot];
  let dist = 0;
  while (frontier.length > 0) {
    dist += 1;
    const next: SlotRef[] = [];
    for (const s of frontier) {
      for (const n of neighbors(s)) {
        const k = slotKey(n);
        if (seen.has(k)) continue;
        if (baseKeys.has(k)) return dist;
        seen.add(k);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}

export interface DeckGate {
  locked: boolean;
  reason?: string;
}

/** Whether a deck may be placed at the given slot right now. */
export function deckGate(
  state: DerivedState,
  deck: CardDef["deck"],
  slot: SlotRef | undefined,
  teamId?: string,
): DeckGate {
  if (deck === "orange" && slot) {
    const d = distanceToBase(state, slot, state.mode, teamId);
    // No base on the map yet → nothing to measure from, allow.
    if (d !== Infinity && d < ORANGE_MIN_DISTANCE) {
      return {
        locked: true,
        reason: `🔒 Orange needs ≥${ORANGE_MIN_DISTANCE} tiles from ${state.mode === "competitive" ? "your" : "a"} Base (this hex: ${d})`,
      };
    }
  }
  if (deck === "red") {
    const opened = revealedCount(state, "orange");
    if (opened < RED_UNLOCK_AFTER) {
      return { locked: true, reason: `🔒 Unlocks after ${RED_UNLOCK_AFTER} Orange opened (${opened}/${RED_UNLOCK_AFTER})` };
    }
  }
  if (deck === "endgame") {
    const opened = revealedCount(state, "red");
    if (opened < ENDGAME_UNLOCK_AFTER) {
      return { locked: true, reason: `🔒 Unlocks after ${ENDGAME_UNLOCK_AFTER} Red opened (${opened}/${ENDGAME_UNLOCK_AFTER})` };
    }
  }
  return { locked: false };
}


/* ------------------------------------------------------------------ */
/* PLACEMENT                                                           */
/* ------------------------------------------------------------------ */

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

/**
 * May this card go on this hex, right now, by this team?
 *
 * The single authority for placement. The card picker asks it to decide what
 * to grey out, and the commit path asks it again before appending the event,
 * so the two can never disagree — the same reason canAct() exists for turns.
 *
 * Deck gates on their own were never enough: nothing stopped a Base going
 * down in round 6, a team laying a second Base, or an Orange being placed
 * during the Planning Phase.
 */
export function canPlace(
  state: DerivedState,
  card: CardDef,
  slot: SlotRef | undefined,
  teamId: string | undefined,
  opts: { isFacilitator?: boolean } = {},
): PlaceCheck {
  const planning = state.phase === "planning";

  if (slot && state.tiles[slotKey(slot)]) {
    return { ok: false, reason: "That hex already has a card on it." };
  }

  if (card.deck === "base") {
    if (!planning && !opts.isFacilitator) {
      return { ok: false, reason: "🔒 Bases are placed in the Planning Phase only." };
    }
    if (teamId) {
      const mine = Object.values(state.tiles).filter(
        (t) => deckOf(t.cardId) === "base" && t.placedByTeamId === teamId,
      ).length;
      if (mine >= 1 && !opts.isFacilitator) {
        return { ok: false, reason: "🔒 Your team already has a Base on the map." };
      }
    }
    return { ok: true };
  }

  if (planning && card.deck !== "green" && !opts.isFacilitator) {
    return {
      ok: false,
      reason: "🔒 Planning lays out Bases and the starting Green cards only.",
    };
  }

  const gate = deckGate(state, card.deck, slot, teamId);
  if (gate.locked && !opts.isFacilitator) {
    return { ok: false, reason: gate.reason };
  }

  return { ok: true };
}
