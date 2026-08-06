import type { DerivedState, GameEvent } from "../types";
import { EVENTS_TABLE, supabase } from "../net/supabase";
import { outcome } from "./progress";
import { economyHealth } from "./rules";

/**
 * Past sessions.
 *
 * Ending a session rotates to a new code and leaves the old rows in place,
 * so nothing is ever destroyed by starting again. This module writes the
 * index row and builds the debrief report from it.
 */

export const SESSIONS_TABLE = "bob_sessions";

export interface ArchivedSession {
  session_code: string;
  title: string | null;
  mode: string | null;
  team_names: string[] | null;
  rounds: number | null;
  outcome: string | null;
  event_count: number | null;
  started_at: string | null;
  ended_at: string;
}

/** Record what this session was, before the code is rotated away. */
export async function archiveSession(
  code: string,
  state: DerivedState,
  events: GameEvent[],
): Promise<void> {
  const sb = supabase();
  if (!sb || !state.created || events.length === 0) return;

  const result = outcome(state);
  const summary =
    result.kind === "won"
      ? `Won — ${result.headline}`
      : result.kind === "lost"
        ? `Lost — ${result.headline}`
        : `Unfinished at round ${state.round}`;

  await sb.from(SESSIONS_TABLE).upsert({
    session_code: code,
    title: state.teamOrder.map((t) => state.teams[t]?.config.name).join(" · "),
    mode: state.mode,
    team_names: state.teamOrder.map((t) => state.teams[t]?.config.name ?? t),
    rounds: state.round,
    outcome: summary,
    event_count: events.length,
    started_at: events[0]?.at ?? null,
    ended_at: new Date().toISOString(),
  });
}

export async function listSessions(limit = 25): Promise<ArchivedSession[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from(SESSIONS_TABLE)
    .select("*")
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[bob] session list failed", error.message);
    return [];
  }
  return (data ?? []) as ArchivedSession[];
}

export async function fetchEvents(code: string): Promise<GameEvent[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from(EVENTS_TABLE)
    .select("*")
    .eq("session_code", code)
    .order("seq", { ascending: true });
  if (error) {
    console.error("[bob] event fetch failed", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    seq: r.seq as number,
    at: r.at as string,
    type: r.type as GameEvent["type"],
    actorTeamId: (r.actor_team_id as string) ?? undefined,
    actorRole: (r.actor_role as GameEvent["actorRole"]) ?? undefined,
    visibility: r.visibility as GameEvent["visibility"],
    groupId: (r.group_id as string) ?? undefined,
    payload: (r.payload as Record<string, unknown>) ?? {},
    note: (r.note as string) ?? undefined,
  }));
}

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A debrief a facilitator can actually use: the arc of the session, each
 * team's final economy, and the full move log with timestamps.
 */
export function buildReport(code: string, state: DerivedState, events: GameEvent[]): string {
  const result = outcome(state);
  const started = events[0]?.at ? new Date(events[0].at) : null;
  const ended = events.length ? new Date(events[events.length - 1].at) : null;
  const mins =
    started && ended ? Math.round((ended.getTime() - started.getTime()) / 60000) : null;

  const lines: string[] = [
    `# Bridge or Bricks — session ${code}`,
    "",
    `- Mode: **${state.mode}**`,
    `- Rounds played: **${state.round}**`,
    `- Duration: **${mins !== null ? `${mins} min` : "unknown"}**`,
    `- Result: **${
      result.kind === "playing" ? "unfinished" : result.kind === "won" ? result.headline : result.headline
    }**`,
    `- Moves recorded: **${events.length}**`,
    "",
    "## Final economies",
    "",
    "| Team | Production | Upkeep | Net | Brick | Supply | Metal |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (!t) continue;
    const h = economyHealth(state, tid);
    lines.push(
      `| ${t.config.name} | ${h.production} | ${h.maintenance} | ${h.net >= 0 ? "+" : ""}${h.net} | ${t.resources.brick} | ${t.resources.supply} | ${t.resources.metal} |`,
    );
  }

  lines.push("", "## Roster", "");
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (!t) continue;
    const who = t.config.members.map((m) => `${m.name} (${m.role})`).join(", ") || "—";
    lines.push(`- **${t.config.name}** — ${who}`);
  }

  lines.push("", "## Discussion prompts", "");
  lines.push(
    result.kind === "lost"
      ? "- At which round did expansion first outrun production minus maintenance?\n- What was the last moment a different call would have changed the outcome?\n- Who saw it coming, and what stopped that being acted on?"
      : "- Which decision bought the most room later?\n- Where did somebody hold back on purpose, and what did that make possible?\n- What would you do differently with the same starting position?",
  );

  lines.push("", "## Move log", "");
  for (const e of events) {
    const when = e.at ? new Date(e.at).toLocaleTimeString() : "";
    const who = e.actorTeamId ? state.teams[e.actorTeamId]?.config.name ?? e.actorTeamId : "—";
    lines.push(`- \`${when}\` **${who}** · ${e.type}${e.note ? ` — ${e.note}` : ""}`);
  }

  return lines.join("\n");
}

export function downloadReport(code: string, state: DerivedState, events: GameEvent[]) {
  download(`bridge-or-bricks-${code}.md`, buildReport(code, state, events), "text/markdown");
}

/** The raw log, for re-importing a session or auditing it. */
export function downloadRaw(code: string, events: GameEvent[]) {
  download(
    `bridge-or-bricks-${code}.json`,
    JSON.stringify({ app: "bridge-or-bricks", version: 1, sessionCode: code, events }, null, 2),
    "application/json",
  );
}
