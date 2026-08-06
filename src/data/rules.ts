import { exposures } from "./hazards";
import type { DerivedState, ProposalItem, ResourceKind, SlotRef, TileState } from "../types";
import { slotKey } from "../types";
import { neighbors } from "./board";
import { CARD_BY_ID } from "./catalog";

/* ============================================================================
   THE ONE PLACE TO TUNE THE GAME
   status: "confirmed" = printed or creator-ruled · "playtest" = still moving
   ========================================================================== */
export const RULES = {
  actionsPerTeamPerRound: 3, // confirmed — per TEAM, not per player

  /** Creator ruling: a tile pays nothing until the team has stood on it. */
  standToActivate: true, // confirmed

  /** Round 1 opens with nothing revealed and nothing affordable without this. */
  startingResources: { brick: 4, supply: 1, metal: 1 } as Record<ResourceKind, number>, // playtest

  // Economy
  tradeGive: { brick: 2 } as CostBag, // confirmed
  tradeGet: { supply: 1 } as CostBag, // confirmed
  /** Nothing in the printed game produces Metal, so the Post is its only source. */
  metalGive: { brick: 3 } as CostBag, // playtest
  metalGet: { metal: 1 } as CostBag, // playtest
  demolishWallCost: { supply: 1 } as CostBag, // confirmed
  endGameDrawCost: { supply: 1 } as CostBag, // confirmed
  nomadSettleCost: { brick: 1 } as CostBag, // confirmed

  // Build costs
  woodBridge: { cost: { brick: 2 } as CostBag, durability: 2, status: "playtest" as const },
  metalBridge: { cost: { brick: 1, metal: 1 } as CostBag, durability: 4, status: "playtest" as const },
  wall: { cost: { brick: 1 } as CostBag, durability: 2, status: "playtest" as const },
  /* Creator ruling: walls AND both bridges last two rounds, and a repair
     buys back one round. Upkeep-by-payment is gone — a structure is kept
     alive by spending an action on it, not by quietly paying rent. */
  repair: {
    wall: { brick: 1 } as CostBag,
    wood: { brick: 1 } as CostBag,
    metal: { brick: 1 } as CostBag,
  },
  structureDecayPerRound: 1,
  maxDurability: 2,

  bridgeUpkeepPerBridge: { brick: 1 } as CostBag, // playtest
  wallsDecayPerRound: 1, // confirmed — walls cannot be maintained

  // Progression gates — map-wide, all teams' reveals count
  orangeMinDistance: 4, // confirmed
  redUnlockAfterOrange: 4, // confirmed
  endGameUnlockAfterRed: 3, // confirmed

  startingGreens: 6, // open ruling: total across the table, or per team?
};

export type CostBag = Partial<Record<ResourceKind, number>>;

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  brick: "🧱",
  supply: "📦",
  metal: "⚙️",
};

export const costLabel = (c: CostBag): string =>
  (Object.entries(c) as [ResourceKind, number][])
    .map(([k, v]) => `${v}${RESOURCE_ICON[k]}`)
    .join(" + ");

export const canAfford = (have: Record<ResourceKind, number>, cost: CostBag): boolean =>
  (Object.entries(cost) as [ResourceKind, number][]).every(([k, v]) => have[k] >= v);

export const parseSlot = (key: string): SlotRef => {
  const [col, row] = key.split(",").map(Number);
  return { col, row };
};

const isRevealed = (t: TileState | undefined): boolean => Boolean(t) && !t!.faceDown;

/** Has this team ever stood here? Bases count automatically — it's their home. */
export function isActivated(tile: TileState | undefined, teamId: string): boolean {
  if (!tile) return false;
  if (!RULES.standToActivate) return true;
  if (tile.cardId.startsWith("BASE")) return tile.placedByTeamId === teamId;
  return Boolean(tile.activatedBy?.includes(teamId));
}

/* ---------------------------------------------------------------------------
   Connectivity: which tiles feed a team's Base.
   ------------------------------------------------------------------------- */
export function connectedToBase(state: DerivedState, teamId: string): Set<string> {
  const out = new Set<string>();
  const queue: SlotRef[] = [];
  for (const [k, t] of Object.entries(state.tiles)) {
    if (t.cardId.startsWith("BASE") && t.placedByTeamId === teamId) {
      out.add(k);
      queue.push(parseSlot(k));
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      const k = slotKey(n);
      if (out.has(k)) continue;
      if (!isRevealed(state.tiles[k])) continue;
      out.add(k);
      queue.push(n);
    }
  }
  return out;
}

const revealedNeighbourIds = (state: DerivedState, key: string): string[] =>
  neighbors(parseSlot(key))
    .map((n) => state.tiles[slotKey(n)])
    .filter(isRevealed)
    .map((t) => t!.cardId);

export interface ProductionLine {
  slot: string;
  cardId: string;
  title: string;
  bricks: number;
  note?: string;
  blocked?: "not-activated" | "disabled" | "condition";
}

export interface TeamProduction {
  bricks: number;
  lines: ProductionLine[];
  /** Connected and revealed, but nobody has stood there yet. */
  dormant: ProductionLine[];
}

/**
 * Production, per the printed cards, with the creator's stand-to-activate rule.
 * A tile pays only when it is: revealed, connected back to the team's Base, and
 * claimed by the team having stood on it at least once.
 */
export function teamProduction(state: DerivedState, teamId: string): TeamProduction {
  const connected = connectedToBase(state, teamId);
  const lines: ProductionLine[] = [];
  const dormant: ProductionLine[] = [];

  for (const key of connected) {
    const tile = state.tiles[key];
    if (!tile || tile.cardId.startsWith("BASE")) continue;
    const card = CARD_BY_ID[tile.cardId];
    const title = card?.title ?? tile.cardId;

    let bricks = 0;
    let note: string | undefined;

    switch (tile.cardId) {
      case "GR01":
      case "GR02":
      case "GR03":
        bricks = 1;
        break;
      case "GR08": {
        const touches = revealedNeighbourIds(state, key).includes("GR03");
        bricks = touches ? 2 : 0;
        note = touches ? "connected to a Valley" : "no adjacent Valley";
        break;
      }
      case "GR07": {
        const greens = revealedNeighbourIds(state, key).filter(
          (id) => CARD_BY_ID[id]?.deck === "green",
        ).length;
        bricks = greens >= 2 ? 2 : 0;
        note = `${greens} adjacent Green tile${greens === 1 ? "" : "s"}`;
        break;
      }
      case "GR05":
        bricks = tile.settled ? 1 : 0;
        note = tile.settled ? "settled" : "not settled yet";
        break;
      default:
        continue; // Orange / Red tiles produce nothing on their own
    }

    if (tile.disabled === "production" || tile.disabled === "tile") {
      lines.push({ slot: key, cardId: tile.cardId, title, bricks: 0, note: "production disabled", blocked: "disabled" });
      continue;
    }

    if (!isActivated(tile, teamId)) {
      dormant.push({
        slot: key,
        cardId: tile.cardId,
        title,
        bricks: 0,
        note: "move a piece here to claim it",
        blocked: "not-activated",
      });
      continue;
    }

    lines.push({ slot: key, cardId: tile.cardId, title, bricks, note });
  }

  lines.sort((a, b) => b.bricks - a.bricks || a.slot.localeCompare(b.slot));
  return { bricks: lines.reduce((n, l) => n + l.bricks, 0), lines, dormant };
}

export const teamBridges = (state: DerivedState, teamId: string) =>
  Object.entries(state.bridges).flatMap(([slot, list]) =>
    list.filter((b) => b.teamId === teamId).map((b) => ({ slot, bridge: b })),
  );

/* ---------------------------------------------------------------------------
   Movement legality. A piece steps to an adjacent revealed tile; Rivers need a
   Wood Bridge on them and Valleys need a Metal Bridge.
   ------------------------------------------------------------------------- */
export interface MoveCheck {
  ok: boolean;
  reason?: string;
}

export function canMoveTo(state: DerivedState, teamId: string, to: string): MoveCheck {
  const dest = state.tiles[to];
  if (!dest) return { ok: false, reason: "There is no card on that hex yet." };
  if (dest.faceDown) return { ok: false, reason: "That card is still face-down — Explore it first." };

  const from = state.teams[teamId]?.characterAt;
  if (from) {
    const adjacent = neighbors(parseSlot(from)).some((n) => slotKey(n) === to);
    if (!adjacent) return { ok: false, reason: "You can only step to an adjacent hex." };
  }

  const bridges = state.bridges[to] ?? [];
  if (dest.cardId === "GR02" && !bridges.some((b) => b.type === "wood")) {
    return { ok: false, reason: "A River needs a Wood Bridge before anyone can cross." };
  }
  if (dest.cardId === "GR03" && !bridges.some((b) => b.type === "metal")) {
    return { ok: false, reason: "A Valley needs a Metal Bridge before anyone can cross." };
  }
  return { ok: true };
}

export interface EconomyHealth {
  production: number;
  maintenance: number;
  net: number;
  risk: "low" | "moderate" | "high";
  message: string;
}

/** Expansion Rate <= Production Rate − Maintenance Cost. The whole game in one line. */
export function economyHealth(state: DerivedState, teamId: string): EconomyHealth {
  const prod = teamProduction(state, teamId);
  const upkeep = RULES.bridgeUpkeepPerBridge.brick ?? 0;
  const maintenance = teamBridges(state, teamId).length * upkeep;
  const net = prod.bricks - maintenance;
  const risk = net >= 2 ? "low" : net >= 0 ? "moderate" : "high";
  const message =
    prod.bricks === 0 && prod.dormant.length > 0
      ? `${prod.dormant.length} connected tile${prod.dormant.length === 1 ? "" : "s"} waiting to be claimed — move a piece onto them.`
      : risk === "low"
        ? "Surplus economy — you can afford to expand."
        : risk === "moderate"
          ? "Break-even — stabilise before you expand further."
          : "Upkeep exceeds production — expansion here leads to collapse.";
  return { production: prod.bricks, maintenance, net, risk, message };
}

/* ---------------------------------------------------------------------------
   Round resolution: Production Phase, then Maintenance Phase.
   ------------------------------------------------------------------------- */
export interface RoundPlan {
  items: ProposalItem[];
  production: Record<string, TeamProduction>;
  maintenanceLog: string[];
}

export function planRound(state: DerivedState): RoundPlan {
  const items: ProposalItem[] = [];
  const production: Record<string, TeamProduction> = {};
  const maintenanceLog: string[] = [];

  for (const teamId of state.teamOrder) {
    const prod = teamProduction(state, teamId);
    production[teamId] = prod;
    if (prod.bricks > 0) {
      items.push({
        type: "resource/change",
        payload: { teamId, resource: "brick", delta: prod.bricks },
        note: `⚙️ ${state.teams[teamId]?.config.name}: +${prod.bricks}🧱 from ${prod.lines.filter((l) => l.bricks > 0).length} claimed tiles`,
      });
    }
  }

  for (const [edge, wall] of Object.entries(state.walls)) {
    const left = wall.durability - RULES.wallsDecayPerRound;
    if (left <= 0) {
      items.push({ type: "wall/remove", payload: { edge }, note: `🧱 Wall crumbled at ${edge}` });
      maintenanceLog.push(`Wall at ${edge} crumbled`);
    } else {
      items.push({
        type: "wall/durability",
        payload: { edge, delta: -RULES.wallsDecayPerRound },
        note: `🧱 Wall at ${edge} decayed to ${left}`,
      });
    }
  }

  /* Hazards bleed anyone whose claimed tiles they touch. Damage scales with
     how much of your territory is exposed, not with the hazard, so a wall on
     one edge is a partial fix and a wall on every edge is a full one. */
  for (const e of exposures(state)) {
    if (e.blocked) continue;
    const team = state.teams[e.teamId];
    if (!team) continue;
    for (const [res, amt] of Object.entries(e.drain)) {
      if (!amt) continue;
      items.push({
        type: "resource/change",
        payload: { teamId: e.teamId, resource: res, delta: -amt },
        note: `🐺 ${team.config.name}: ${e.label} at ${e.hazardSlot} raided ${e.victimSlot} −${amt}`,
      });
    }
    maintenanceLog.push(
      `${team.config.name}: ${e.label} raided ${e.victimSlot}` +
        (e.edge ? ` — a wall at ${e.edge} would stop it` : " — a wall cannot stop this one"),
    );
  }

  /* Every bridge loses a point each Maintenance Phase, whoever owns it, so
     two rounds is the natural life of anything built. Spending an action to
     repair is what makes a structure last. */
  for (const teamId of state.teamOrder) {
    const team = state.teams[teamId];
    if (!team) continue;
    for (const { slot, bridge } of teamBridges(state, teamId)) {
      const left = bridge.durability - RULES.structureDecayPerRound;
      if (left <= 0) {
        items.push({
          type: "bridge/remove",
          payload: { slot, bridgeId: bridge.id },
          note: `💥 ${team.config.name}: ${bridge.type} bridge collapsed at ${slot}`,
        });
        maintenanceLog.push(`${team.config.name}: ${bridge.type} bridge collapsed at ${slot}`);
      } else {
        items.push({
          type: "bridge/durability",
          payload: { slot, bridgeId: bridge.id, delta: -RULES.structureDecayPerRound },
          note: `🔧 ${team.config.name}: ${bridge.type} bridge at ${slot} → ${left}`,
        });
        if (left === 1) {
          maintenanceLog.push(`${team.config.name}: ${bridge.type} bridge at ${slot} is one round from collapse`);
        }
      }
    }
  }

  return { items, production, maintenanceLog };
}

/* --------------------------------------------------------------------------
   End Game deck — a real 9-card deck.
   ------------------------------------------------------------------------ */
export const ENDGAME_DECK: string[] = ["EG01", ...Array.from({ length: 6 }, () => "EG02"), "EG03", "EG04"];

export function endgameRemaining(state: DerivedState): string[] {
  const left = [...ENDGAME_DECK];
  for (const id of state.endgameDrawn) {
    const i = left.indexOf(id);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

export function drawEndgameCard(state: DerivedState): string | null {
  const left = endgameRemaining(state);
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
}

export function goldenGateOdds(state: DerivedState): { chance: string; left: number } {
  const left = endgameRemaining(state);
  return {
    left: left.length,
    chance: !left.includes("EG01") ? "already drawn" : left.length ? `1 in ${left.length}` : "—",
  };
}

/** A team collapses when it can take no legal action and holds nothing. */
export function isCollapsed(state: DerivedState, teamId: string): boolean {
  const t = state.teams[teamId];
  if (!t) return false;
  const broke = t.resources.brick === 0 && t.resources.supply === 0 && t.resources.metal === 0;
  const noProduction = teamProduction(state, teamId).bricks === 0;
  return broke && noProduction && state.round > 1;
}
