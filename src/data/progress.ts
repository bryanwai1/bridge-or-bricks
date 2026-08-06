import type { DerivedState } from "../types";
import { isCollapsed, teamProduction } from "./rules";
import { RED_UNLOCK_AFTER, ENDGAME_UNLOCK_AFTER, revealedCount } from "./gates";

/**
 * Where the table has got to, and whether the game is over.
 *
 * Everything here is derived from the event log — no extra state to sync, and
 * rewinding with undo rewinds the ending too. The Act drives the whole
 * palette: App writes it to <html data-act>, and theme.css plus the canvas
 * Backdrop repaint together.
 */

export type ActNo = 1 | 2 | 3;

export interface ActInfo {
  act: ActNo;
  label: string;
  /** What has to happen for the next Act to open, or null at Act 3. */
  next: string | null;
  /** 0..1 progress toward the next gate. */
  progress: number;
}

export function currentActFrom(state: DerivedState): ActNo {
  if (revealedCount(state, "red") > 0) return 3;
  if (revealedCount(state, "orange") > 0) return 2;
  return 1;
}

export function actInfo(state: DerivedState): ActInfo {
  const orange = revealedCount(state, "orange");
  const red = revealedCount(state, "red");
  const act = currentActFrom(state);

  if (act === 1) {
    return {
      act,
      label: "Act I · Growth",
      next: "Open an Orange card to enter Act II",
      progress: 0,
    };
  }
  if (act === 2) {
    return {
      act,
      label: "Act II · Pressure",
      next: `Red unlocks at ${RED_UNLOCK_AFTER} Orange opened (${Math.min(orange, RED_UNLOCK_AFTER)}/${RED_UNLOCK_AFTER})`,
      progress: Math.min(1, orange / RED_UNLOCK_AFTER),
    };
  }
  return {
    act,
    label: "Act III · Convergence",
    next:
      red >= ENDGAME_UNLOCK_AFTER
        ? "End Game deck is open"
        : `End Game unlocks at ${ENDGAME_UNLOCK_AFTER} Red opened (${red}/${ENDGAME_UNLOCK_AFTER})`,
    progress: Math.min(1, red / ENDGAME_UNLOCK_AFTER),
  };
}

/* ---------------------------------------------------------------- endings */

export type Outcome =
  | { kind: "playing" }
  | { kind: "won"; winners: string[]; headline: string; detail: string }
  | { kind: "lost"; headline: string; detail: string };

export const gateFound = (state: DerivedState) => state.endgameDrawn.includes("EG01");

export const enteredGate = (state: DerivedState): string[] => state.gateEntered ?? [];

export function hasEntered(state: DerivedState, teamId: string): boolean {
  return enteredGate(state).includes(teamId);
}

/** Teams that can take no action and hold nothing. */
export function collapsedTeams(state: DerivedState): string[] {
  return state.teamOrder.filter((tid) => isCollapsed(state, tid));
}

/**
 * A team is not yet collapsed but is heading there: no income and almost
 * nothing in the pool. Worth saying out loud before it is unrecoverable.
 */
export function strugglingTeams(state: DerivedState): string[] {
  return state.teamOrder.filter((tid) => {
    if (isCollapsed(state, tid)) return false;
    const t = state.teams[tid];
    if (!t) return false;
    const held = t.resources.brick + t.resources.supply + t.resources.metal;
    return teamProduction(state, tid).bricks === 0 && held <= 2 && state.round > 1;
  });
}

export function outcome(state: DerivedState): Outcome {
  if (!state.created || state.teamOrder.length === 0) return { kind: "playing" };

  const entered = enteredGate(state);
  const name = (tid: string) => state.teams[tid]?.config.name ?? tid;

  if (state.mode === "competitive") {
    // first team through the Gate takes it
    if (entered.length > 0) {
      return {
        kind: "won",
        winners: [entered[0]],
        headline: `${name(entered[0])} reached the Golden Gate`,
        detail: "First through the Gate. The race is over.",
      };
    }
  } else if (gateFound(state) && state.teamOrder.every((tid) => entered.includes(tid))) {
    // collaborative: nobody wins until everybody is through
    return {
      kind: "won",
      winners: [...state.teamOrder],
      headline: "Every team is through the Golden Gate",
      detail: "The table won together. Nobody was left behind.",
    };
  }

  const dead = collapsedTeams(state);
  if (dead.length > 0 && dead.length === state.teamOrder.length) {
    return {
      kind: "lost",
      headline: "Systemic collapse",
      detail:
        "Every team ran out of moves and resources at once. Expansion outran production minus maintenance — the formula the whole game rests on.",
    };
  }

  return { kind: "playing" };
}

/** Short line for the projector and the round banner. */
export function gateStatus(state: DerivedState): string | null {
  if (!gateFound(state)) return null;
  const entered = enteredGate(state);
  if (state.mode === "competitive") {
    return entered.length > 0 ? "The Gate has been taken" : "The Gate is open — first team through wins";
  }
  const left = state.teamOrder.filter((tid) => !entered.includes(tid)).length;
  if (left === 0) return "Every team is through";
  return `${entered.length}/${state.teamOrder.length} teams through the Gate — ${left} still outside`;
}
