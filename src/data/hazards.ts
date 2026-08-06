import type { DerivedState } from "../types";
import { edgeKey, slotKey } from "../types";
import { neighbors } from "./board";
import { isActivated, parseSlot, type CostBag } from "./rules";

/**
 * Cards that cost you something just by being next to your territory.
 *
 * This is the rulebook's "Walls block Wild Animals" turned into a working
 * mechanic. A hazard sitting beside a tile your piece has claimed bleeds you
 * every Maintenance Phase, per exposed tile — so the damage scales with how
 * much of your territory touches it, not with the hazard itself. Building a
 * wall on the shared edge stops that edge bleeding.
 *
 * It gives walls a reason to exist beyond chokepoints, and it puts a real
 * price on expanding toward something you have not scouted.
 */

export interface Hazard {
  label: string;
  /** Taken from each exposed team, per exposed tile, every round. */
  drain: CostBag;
  /**
   * Can a wall on the shared edge stop it? True for anything with legs.
   * A plague walks through masonry, so it does not care.
   */
  walkable: boolean;
}

export const HAZARDS: Record<string, Hazard> = {
  GR04: { label: "Wild Animals", drain: { brick: 1 }, walkable: true },
  RD06: { label: "Wild Predator Grounds", drain: { brick: 1 }, walkable: true },
  RD17: { label: "Rampaging Beasts", drain: { brick: 2 }, walkable: true },
  RD24: { label: "Werewolf Sighting", drain: { brick: 1 }, walkable: true },
  EG03: { label: "Wild Wolves", drain: { brick: 2 }, walkable: true },
  EG04: { label: "Barbarians", drain: { brick: 2, supply: 1 }, walkable: true },
  // disease does not respect a wall
  RD28: { label: "Plague Outbreak", drain: { brick: 1 }, walkable: false },
};

export interface Exposure {
  teamId: string;
  /** Where the hazard sits. */
  hazardSlot: string;
  hazardId: string;
  label: string;
  /** The claimed tile of yours that it is reaching. */
  victimSlot: string;
  /** The edge a wall would go on, or null when a wall cannot help. */
  edge: string | null;
  drain: CostBag;
  /** Already walled off — listed so the UI can show it as handled. */
  blocked: boolean;
}

/**
 * Every place a hazard currently touches claimed territory.
 *
 * Face-down cards are ignored: nobody knows what is under them, so they
 * cannot be bleeding anyone yet.
 */
export function exposures(state: DerivedState): Exposure[] {
  const out: Exposure[] = [];

  for (const [hazardSlot, tile] of Object.entries(state.tiles)) {
    if (tile.faceDown) continue;
    const hazard = HAZARDS[tile.cardId];
    if (!hazard) continue;

    for (const n of neighbors(parseSlot(hazardSlot))) {
      const victimSlot = slotKey(n);
      const victim = state.tiles[victimSlot];
      if (!victim || victim.faceDown) continue;
      if (HAZARDS[victim.cardId]) continue; // hazards do not eat each other

      const edge = hazard.walkable
        ? edgeKey(parseSlot(hazardSlot), n)
        : null;
      const blocked = edge ? Boolean(state.walls[edge]) : false;

      for (const teamId of state.teamOrder) {
        if (!isActivated(victim, teamId)) continue;
        out.push({
          teamId,
          hazardSlot,
          hazardId: tile.cardId,
          label: hazard.label,
          victimSlot,
          edge,
          drain: hazard.drain,
          blocked,
        });
      }
    }
  }

  return out;
}

/** What each team actually loses this round, after walls are accounted for. */
export function hazardToll(state: DerivedState): Record<string, CostBag> {
  const toll: Record<string, CostBag> = {};
  for (const e of exposures(state)) {
    if (e.blocked) continue;
    const bag = (toll[e.teamId] ??= {});
    for (const [res, amt] of Object.entries(e.drain)) {
      bag[res as keyof CostBag] = (bag[res as keyof CostBag] ?? 0) + (amt as number);
    }
  }
  return toll;
}

/** Edges where a wall would stop a bleed right now — what to glow on the map. */
export function wallWouldHelp(state: DerivedState): Set<string> {
  const out = new Set<string>();
  for (const e of exposures(state)) {
    if (!e.blocked && e.edge) out.add(e.edge);
  }
  return out;
}

export function describeBag(bag: CostBag): string {
  const icon: Record<string, string> = { brick: "🧱", supply: "📦", metal: "⚙️" };
  return (
    Object.entries(bag)
      .filter(([, v]) => Number(v ?? 0) > 0)
      .map(([k, v]) => `${v}${icon[k] ?? k}`)
      .join(" ") || "—"
  );
}
