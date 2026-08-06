import type { DerivedState } from "../types";

/**
 * Where each team sits, and how far to spin the board to look at it from
 * their chair.
 *
 * Teams stand around a physical mat, so every team reads the board upside
 * down some of the time. Rolling the map round to a team's seat before they
 * play removes the mental rotation, and on the projector it tells the room
 * whose turn it is without anyone reading a word.
 *
 * Seats are derived from the drawn turn order, so every device — phones,
 * board, projector — computes the same angles with no extra state to sync.
 * A per-device offset lets the facilitator line the ring up with the real
 * room, since the app cannot know which way the TV is facing.
 */

const OFFSET_KEY = "bob-seat-offset";

export function seatOffset(): number {
  return Number(localStorage.getItem(OFFSET_KEY) ?? 0);
}

export function setSeatOffset(deg: number) {
  localStorage.setItem(OFFSET_KEY, String(((deg % 360) + 360) % 360));
}

/** The order teams are seated in: the drawn turn order, or setup order before that. */
export function seatOrder(state: DerivedState): string[] {
  return state.turnOrder.length > 0 ? state.turnOrder : state.teamOrder;
}

/** Compass bearing of a team's chair, evenly spaced around the table. */
export function seatBearing(state: DerivedState, teamId: string): number {
  const order = seatOrder(state);
  const i = order.indexOf(teamId);
  if (i < 0 || order.length === 0) return 0;
  return (i * 360) / order.length;
}

/**
 * Board rotation that puts a team's edge nearest the viewer — their view of
 * the mat. Spinning the board the opposite way to the bearing brings that
 * side to the front.
 */
export function povRotation(state: DerivedState, teamId: string): number {
  return (((360 - seatBearing(state, teamId) + seatOffset()) % 360) + 360) % 360;
}

/** Whose seat is the board closest to facing right now? */
export function nearestSeat(state: DerivedState, rotation: number): string | undefined {
  const order = seatOrder(state);
  if (order.length === 0) return undefined;
  let best = order[0];
  let bestGap = 999;
  for (const tid of order) {
    const target = povRotation(state, tid);
    // shortest way round, in degrees
    const gap = Math.abs(((rotation - target + 540) % 360) - 180);
    if (gap < bestGap) {
      bestGap = gap;
      best = tid;
    }
  }
  return best;
}
