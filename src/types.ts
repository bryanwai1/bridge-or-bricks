export type RoleType =
  | "cartographer"
  | "quartermaster"
  | "leader"
  | "negotiator"
  | "follower"
  | "facilitator";

export type Visibility = "public" | "team" | "facilitator";

export type ResourceKind = "brick" | "supply" | "metal";

export interface Member {
  id: string;
  name: string;
  role: RoleType;
}

export interface TeamConfig {
  id: string;
  name: string;
  color: string;
  /** How many players are on this team. 2 to 8. Defaults to 4 for older sessions. */
  size?: number;
  pin?: string; // 4-digit join PIN, shown privately by the facilitator
  members: Member[];
}

export type GameMode = "collaborative" | "competitive";

export interface SlotRef {
  col: number;
  row: number;
}

export const slotKey = (s: SlotRef) => `${s.col},${s.row}`;
export const edgeKey = (a: SlotRef, b: SlotRef) => {
  const ka = slotKey(a);
  const kb = slotKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export interface BridgeInstance {
  id: string;
  type: "wood" | "metal";
  teamId: string;
  durability: number;
}

export interface TileState {
  cardId: string;
  placedByTeamId?: string;
  disabled?: "construction" | "production" | "tile" | null;
  /** Fog-of-war: the card sits on the map showing its deck back until Explored. */
  faceDown?: boolean;
  /** Nomad Tribe: paid to settle, so it now produces every round. */
  settled?: boolean;
  /** Teams that have stood here. A tile pays nothing to a team until it has. */
  activatedBy?: string[];
}

export interface WallState {
  teamId: string;
  durability: number;
}

export type EventType =
  | "session/create"
  | "team/join"
  | "tile/place"
  | "tile/remove"
  | "tile/disable"
  | "tile/reveal"
  | "tile/settle"
  | "wall/place"
  | "wall/remove"
  | "wall/durability"
  | "bridge/place"
  | "bridge/remove"
  | "bridge/durability"
  | "character/move"
  | "resource/change"
  | "token/use"
  | "token/refresh"
  | "action/log"
  | "negotiation/open"
  | "negotiation/close"
  | "phase/advance"
  | "endgame/draw"
  | "note/add"
  | "proposal/submit"
  | "proposal/approve"
  | "proposal/reject"
  | "order/set"
  | "turn/next";

export interface GameEvent {
  id: string;
  seq: number;
  at: string; // ISO timestamp
  type: EventType;
  actorTeamId?: string;
  actorRole?: RoleType;
  visibility: Visibility;
  groupId?: string;
  payload: Record<string, unknown>;
  note?: string;
}

/** One gameplay event wrapped inside a proposal, applied only on Leader approval. */
export interface ProposalItem {
  type: EventType;
  payload: Record<string, unknown>;
  note?: string;
}

export interface ProposalRecord {
  id: string;
  teamId?: string;
  role?: RoleType;
  summary: string;
  items: ProposalItem[];
  state: "pending" | "approved" | "rejected";
}

export interface NegotiationRecord {
  id: string;
  openedByTeamId: string;
  withTeamIds: string[];
  state: "opened" | "agreed" | "declined";
  terms?: string;
  truceRounds?: number;
}

export interface TeamState {
  config: TeamConfig;
  resources: Record<ResourceKind, number>;
  actionTokens: { available: number; used: number };
  characterAt?: string; // slot key
}

export interface DerivedState {
  created: boolean;
  mode: GameMode;
  round: number;
  phase: "planning" | "actions" | "production" | "maintenance";
  teams: Record<string, TeamState>;
  teamOrder: string[];
  /** Randomised play order set when planning ends. Empty until then. */
  turnOrder: string[];
  activeTurnIndex: number;
  proposals: Record<string, ProposalRecord>;
  tiles: Record<string, TileState>;
  walls: Record<string, WallState>;
  bridges: Record<string, BridgeInstance[]>;
  negotiations: Record<string, NegotiationRecord>;
  endgameDrawn: string[];
  /** Last few public notes, for the projector ticker. */
  recentNotes: string[];
}

export interface SessionFile {
  app: "bridge-or-bricks";
  formatVersion: 1;
  savedAt: string;
  events: GameEvent[];
}
