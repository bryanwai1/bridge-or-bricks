import type { DerivedState, RoleType } from "../types";

/**
 * Whose turn is it, and may this team act right now?
 *
 * Creator ruling: hard lock. Out of turn, the app blocks the action outright
 * rather than warning and letting it through. The facilitator is never
 * blocked — they need to be able to unstick the table.
 *
 * Every gate in the UI goes through canAct() so there is exactly one place
 * that decides, and the Board tab and the Actions tab can never disagree.
 */

export interface TurnCheck {
  ok: boolean;
  reason?: string;
  /** true when this is "not yet", rather than "never" */
  waiting?: boolean;
}

export function activeTeamId(state: DerivedState): string | undefined {
  return state.turnOrder[state.activeTurnIndex];
}

export function nextTeamId(state: DerivedState): string | undefined {
  if (state.turnOrder.length === 0) return undefined;
  return state.turnOrder[(state.activeTurnIndex + 1) % state.turnOrder.length];
}

/** Every team has spent all three actions — the round is ready to resolve. */
export function roundComplete(state: DerivedState): boolean {
  if (state.turnOrder.length === 0 || state.phase === "planning") return false;
  return state.turnOrder.every((tid) => (state.teams[tid]?.actionTokens.available ?? 0) === 0);
}

export function canAct(
  state: DerivedState,
  teamId: string | undefined,
  role: RoleType,
): TurnCheck {
  // the Planning Phase is world-building, not turns — nobody spends actions
  if (state.phase === "planning") return { ok: true };

  // the facilitator sits outside the turn order on purpose
  if (role === "facilitator") return { ok: true };

  if (!teamId || !state.teams[teamId]) {
    return { ok: false, reason: "Pick your team from the menu at the top first." };
  }

  if (state.turnOrder.length === 0) {
    return {
      ok: false,
      waiting: true,
      reason: "Turn order has not been drawn yet — the facilitator starts Round 1 from the Actions tab.",
    };
  }

  const active = activeTeamId(state);
  if (teamId !== active) {
    const name = state.teams[active ?? ""]?.config.name ?? "another team";
    return { ok: false, waiting: true, reason: `Not your turn — ${name} is playing.` };
  }

  if ((state.teams[teamId]?.actionTokens.available ?? 0) === 0) {
    return {
      ok: false,
      waiting: true,
      reason: "All 3 actions spent — the table has moved on to the next team.",
    };
  }

  return { ok: true };
}
