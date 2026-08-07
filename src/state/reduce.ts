import type {
  BridgeInstance,
  DerivedState,
  GameEvent,
  GameMode,
  Member,
  NegotiationRecord,
  ProposalItem,
  ResourceKind,
  TeamConfig,
} from "../types";
import { RULES } from "../data/rules";

export const ACTION_TOKENS_PER_TURN = RULES.actionsPerTeamPerRound;

export function emptyState(): DerivedState {
  return {
    created: false,
    mode: "collaborative",
    round: 1,
    phase: "actions",
    teams: {},
    teamOrder: [],
    turnOrder: [],
    activeTurnIndex: 0,
    proposals: {},
    tiles: {},
    walls: {},
    bridges: {},
    negotiations: {},
    endgameDrawn: [],
    gateEntered: [],
    recentNotes: [],
  };
}

export function applyEvent(st: DerivedState, ev: GameEvent): DerivedState {
  const s: DerivedState = structuredClone(st);
  const p = ev.payload as Record<string, never>;

  // keep a short public ticker for the projector
  if (ev.note && ev.visibility === "public") {
    s.recentNotes = [...s.recentNotes, ev.note].slice(-30);
  }

  switch (ev.type) {
    case "session/create": {
      const teams = p["teams"] as unknown as TeamConfig[];
      s.created = true;
      s.mode = p["mode"] as unknown as GameMode;
      if (p["planning"]) {
        s.phase = "planning";
        s.round = 0;
      }
      s.teamOrder = teams.map((t) => t.id);
      s.teams = {};
      for (const t of teams) {
        s.teams[t.id] = {
          config: t,
          // a starting stake, or round 1 has no income and nothing affordable
          resources: { ...RULES.startingResources },
          actionTokens: { available: ACTION_TOKENS_PER_TURN, used: 0 },
        };
      }
      if (p["adminHash"]) s.adminHash = p["adminHash"] as string;
      break;
    }
    case "team/join": {
      const team = s.teams[p["teamId"] as string];
      if (!team) break;
      const member = p["member"] as unknown as Member;
      const existing = team.config.members.findIndex((m) => m.id === member.id);
      if (existing >= 0) team.config.members[existing] = member;
      else team.config.members = [...team.config.members, member];
      break;
    }
    case "tile/place": {
      const slot = p["slot"] as string;
      const cardId = p["cardId"] as string;
      const owner = p["teamId"] as string | undefined;
      s.tiles[slot] = {
        cardId,
        placedByTeamId: owner,
        disabled: null,
        faceDown: Boolean(p["faceDown"]),
        activatedBy: owner ? [owner] : [],
      };
      // A team's piece starts on its Base. Without this characterAt is
      // undefined, the adjacency check in canMoveTo has nothing to measure
      // from, and the first move could legally land anywhere on the map.
      if (cardId.startsWith("BASE") && owner && s.teams[owner] && !s.teams[owner].characterAt) {
        s.teams[owner].characterAt = slot;
      }
      break;
    }
    case "tile/reveal": {
      const t = s.tiles[p["slot"] as string];
      if (t) t.faceDown = false;
      break;
    }
    /* Explore turns the physical card over, and this records which card it
       was. Placement no longer knows — that is the fog of war. */
    case "tile/identify": {
      const t = s.tiles[p["slot"] as string];
      if (t) {
        t.cardId = p["cardId"] as string;
        t.faceDown = false;
      }
      break;
    }
    case "tile/settle": {
      const t = s.tiles[p["slot"] as string];
      if (t) t.settled = true;
      break;
    }
    case "tile/remove": {
      delete s.tiles[p["slot"] as string];
      delete s.bridges[p["slot"] as string];
      break;
    }
    case "tile/disable": {
      const t = s.tiles[p["slot"] as string];
      if (t) t.disabled = (p["disabled"] as never) ?? null;
      break;
    }
    case "wall/place": {
      s.walls[p["edge"] as string] = {
        teamId: p["teamId"] as string,
        durability: (p["durability"] as unknown as number) ?? RULES.wall.durability,
      };
      break;
    }
    case "wall/remove": {
      delete s.walls[p["edge"] as string];
      break;
    }
    case "wall/durability": {
      const w = s.walls[p["edge"] as string];
      if (w) w.durability += p["delta"] as unknown as number;
      break;
    }
    case "bridge/place": {
      const key = p["slot"] as string;
      const list = s.bridges[key] ?? [];
      list.push({
        id: ev.id,
        type: p["bridgeType"] as unknown as BridgeInstance["type"],
        teamId: p["teamId"] as string,
        durability: (p["durability"] as unknown as number) ?? 1,
      });
      s.bridges[key] = list;
      break;
    }
    case "bridge/remove": {
      const key = p["slot"] as string;
      s.bridges[key] = (s.bridges[key] ?? []).filter((b) => b.id !== p["bridgeId"]);
      if (s.bridges[key].length === 0) delete s.bridges[key];
      break;
    }
    case "bridge/durability": {
      const key = p["slot"] as string;
      const b = (s.bridges[key] ?? []).find((x) => x.id === p["bridgeId"]);
      if (b) b.durability += p["delta"] as unknown as number;
      break;
    }
    case "character/move": {
      const teamId = p["teamId"] as string;
      const slot = (p["slot"] as string) || undefined;
      const team = s.teams[teamId];
      if (team) team.characterAt = slot;
      // standing on a tile claims it for this team, permanently
      if (slot) {
        const tile = s.tiles[slot];
        if (tile) {
          const claimed = tile.activatedBy ?? [];
          if (!claimed.includes(teamId)) tile.activatedBy = [...claimed, teamId];
        }
      }
      break;
    }
    case "resource/change": {
      const team = s.teams[p["teamId"] as string];
      if (team) {
        const kind = p["resource"] as unknown as ResourceKind;
        team.resources[kind] = Math.max(0, team.resources[kind] + (p["delta"] as unknown as number));
      }
      break;
    }
    case "token/use": {
      const teamId = p["teamId"] as string;
      const team = s.teams[teamId];
      if (team && team.actionTokens.available > 0) {
        team.actionTokens.available -= 1;
        team.actionTokens.used += 1;
        // Spending the third action passes the table on. Doing this in the
        // reducer rather than in a button handler means every route to an
        // action -- Board tab, Actions tab, an approved proposal -- advances
        // the turn identically, and undo rewinds it for free.
        if (
          team.actionTokens.available === 0 &&
          s.turnOrder.length > 0 &&
          s.turnOrder[s.activeTurnIndex] === teamId
        ) {
          s.activeTurnIndex = (s.activeTurnIndex + 1) % s.turnOrder.length;
        }
      }
      break;
    }
    case "token/refresh": {
      const team = s.teams[p["teamId"] as string];
      if (team) {
        team.actionTokens.available = ACTION_TOKENS_PER_TURN;
        team.actionTokens.used = 0;
      }
      break;
    }
    case "action/log":
    case "note/add":
      break;
    case "negotiation/open": {
      const rec: NegotiationRecord = {
        id: ev.id,
        openedByTeamId: p["fromTeamId"] as string,
        withTeamIds: p["withTeamIds"] as unknown as string[],
        state: "opened",
      };
      s.negotiations[rec.id] = rec;
      break;
    }
    case "negotiation/close": {
      const rec = s.negotiations[p["negotiationId"] as string];
      if (rec) {
        rec.state = p["result"] as never;
        rec.terms = p["terms"] as string | undefined;
        rec.truceRounds = p["truceRounds"] as unknown as number | undefined;
      }
      break;
    }
    case "phase/advance": {
      s.phase = p["phase"] as never;
      const round = p["round"] as unknown as number;
      if (round !== s.round) s.activeTurnIndex = 0;
      s.round = round;
      break;
    }
    case "endgame/draw": {
      s.endgameDrawn.push(p["cardId"] as string);
      break;
    }
    case "endgame/enter": {
      const tid = p["teamId"] as string;
      s.gateEntered = s.gateEntered ?? [];
      if (!s.gateEntered.includes(tid)) s.gateEntered.push(tid);
      break;
    }
    case "proposal/submit": {
      s.proposals[ev.id] = {
        id: ev.id,
        teamId: ev.actorTeamId,
        role: ev.actorRole,
        summary: (p["summary"] as string) ?? "Proposed action",
        items: p["items"] as unknown as ProposalItem[],
        state: "pending",
      };
      break;
    }
    case "proposal/approve": {
      const rec = s.proposals[p["proposalId"] as string];
      if (!rec || rec.state !== "pending") break;
      rec.state = "approved";
      let cur = s;
      rec.items.forEach((item, i) => {
        cur = applyEvent(cur, {
          ...ev,
          id: `${ev.id}:${i}`,
          type: item.type,
          payload: item.payload,
          note: item.note,
        });
      });
      return cur;
    }
    case "proposal/reject": {
      const rec = s.proposals[p["proposalId"] as string];
      if (rec && rec.state === "pending") rec.state = "rejected";
      break;
    }
    case "order/set": {
      s.turnOrder = p["order"] as unknown as string[];
      s.activeTurnIndex = 0;
      break;
    }
    case "turn/next": {
      if (s.turnOrder.length > 0)
        s.activeTurnIndex = (s.activeTurnIndex + 1) % s.turnOrder.length;
      break;
    }
  }
  return s;
}

export function reduceEvents(events: GameEvent[]): DerivedState {
  let s = emptyState();
  for (const ev of events) s = applyEvent(s, ev);
  return s;
}
