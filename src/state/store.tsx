/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DerivedState, EventType, GameEvent, RoleType, SessionFile, Visibility } from "../types";
import { reduceEvents } from "./reduce";
import { archiveSession } from "../data/archive";
import {
  EVENTS_TABLE,
  rotateSessionCode,
  sessionCode,
  supabase,
} from "../net/supabase";

const STORAGE_KEY = "bob-session-v1";
const IDENTITY_KEY = "bob-identity-v1";
export const RELAY_PORT = 5200;

// Board-mutating events. Submitted by anyone other than the Leader/facilitator,
// they are wrapped into a proposal the team Leader must approve first.
const GAMEPLAY_TYPES = new Set<EventType>([
  "tile/place",
  "tile/remove",
  "tile/disable",
  "tile/reveal",
  "tile/identify",
  "wall/place",
  "wall/remove",
  "wall/durability",
  "bridge/place",
  "bridge/remove",
  "bridge/durability",
  "character/move",
  "resource/change",
  "token/use",
  "action/log",
  "endgame/draw",
  "endgame/enter",
  "trade/offer",
  "trade/counter",
  "trade/accept",
  "trade/decline",
]);

export function roleCanCommit(role: RoleType): boolean {
  return role === "leader" || role === "facilitator";
}

export type SyncStatus = "connected" | "connecting" | "offline";

export interface ActiveIdentity {
  teamId: string | null; // null = facilitator / table view
  role: RoleType;
  memberName?: string;
}

interface Store {
  events: GameEvent[];
  state: DerivedState;
  identity: ActiveIdentity;
  sync: SyncStatus;
  setIdentity: (i: ActiveIdentity) => void;
  append: (
    type: EventType,
    payload: Record<string, unknown>,
    opts?: { visibility?: Visibility; note?: string; groupId?: string },
  ) => void;
  appendGroup: (
    items: { type: EventType; payload: Record<string, unknown>; note?: string }[],
    opts?: { visibility?: Visibility },
  ) => void;
  undo: () => void;
  canUndo: boolean;
  resetSession: () => void;
  exportSession: () => void;
  importSession: (file: File) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function loadLocalEvents(): GameEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as SessionFile).events ?? [];
  } catch {
    return [];
  }
}

function loadIdentity(): ActiveIdentity {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    if (raw) return JSON.parse(raw) as ActiveIdentity;
  } catch {
    /* ignore */
  }
  return { teamId: null, role: "facilitator" };
}

/** GameEvent -> the shape bob_events wants. */
function eventToRow(e: GameEvent, code: string) {
  return {
    id: e.id,
    session_code: code,
    seq: e.seq,
    at: e.at,
    type: e.type,
    actor_team_id: e.actorTeamId ?? null,
    actor_role: e.actorRole ?? null,
    visibility: e.visibility,
    group_id: e.groupId ?? null,
    payload: e.payload,
    note: e.note ?? null,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<GameEvent[]>(loadLocalEvents);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const [identity, setIdentityState] = useState<ActiveIdentity>(loadIdentity);
  const codeRef = useRef<string>(sessionCode());
  const eventsRef = useRef<GameEvent[]>([]);
  const seqRef = useRef(0);
  seqRef.current = events.length ? events[events.length - 1].seq : 0;

  const setIdentity = useCallback((i: ActiveIdentity) => {
    setIdentityState(i);
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(i));
  }, []);

  // persist locally always (offline fallback + refresh warm-start)
  useEffect(() => {
    const file: SessionFile = {
      app: "bridge-or-bricks",
      formatVersion: 1,
      savedAt: new Date().toISOString(),
      events,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  }, [events]);

  /* ----------------------------------------------------------------
     Cloud sync.

     Load every row for this session code, then subscribe. Inserts append,
     deletes rewind (that is how undo reaches other devices). Rows are keyed
     by their event id, so a device that made a change locally does not
     double-apply it when the echo arrives.
     ---------------------------------------------------------------- */
  const code = codeRef.current;

  useEffect(() => {
    const sb = supabase();
    if (!sb) {
      // no credentials: single device, local log only
      setSync("offline");
      return;
    }

    let cancelled = false;
    setSync("connecting");

    const merge = (incoming: GameEvent[]) =>
      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        for (const e of incoming) byId.set(e.id, e);
        return [...byId.values()].sort((a, b) => a.seq - b.seq);
      });

    const rowToEvent = (r: Record<string, unknown>): GameEvent => ({
      id: r.id as string,
      seq: r.seq as number,
      at: r.at as string,
      type: r.type as GameEvent["type"],
      actorTeamId: (r.actor_team_id as string) ?? undefined,
      actorRole: (r.actor_role as RoleType) ?? undefined,
      visibility: r.visibility as Visibility,
      groupId: (r.group_id as string) ?? undefined,
      payload: (r.payload as Record<string, unknown>) ?? {},
      note: (r.note as string) ?? undefined,
    });

    (async () => {
      const { data, error } = await sb
        .from(EVENTS_TABLE)
        .select("*")
        .eq("session_code", code)
        .order("seq", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("[bob] load failed", error.message);
        setSync("offline");
        return;
      }

      const remote = (data ?? []).map(rowToEvent);
      const local = loadLocalEvents();

      if (remote.length === 0 && local.length > 0) {
        // first device on a fresh code: seed the table from what is on disk
        await sb.from(EVENTS_TABLE).insert(local.map((e) => eventToRow(e, code)));
        setSync("connected");
      } else {
        setEvents(remote);
        setSync("connected");
      }
    })();

    const channel = sb
      .channel(`bob:${code}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: EVENTS_TABLE, filter: `session_code=eq.${code}` },
        (msg) => merge([rowToEvent(msg.new as Record<string, unknown>)]),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: EVENTS_TABLE, filter: `session_code=eq.${code}` },
        (msg) => {
          const gone = (msg.old as Record<string, unknown>)?.id as string | undefined;
          if (gone) setEvents((prev) => prev.filter((e) => e.id !== gone));
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setSync("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSync("offline");
      });

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [code]);

  const state = useMemo(() => reduceEvents(events), [events]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const mkEvent = useCallback(
    (
      type: EventType,
      payload: Record<string, unknown>,
      opts?: { visibility?: Visibility; note?: string; groupId?: string },
    ): GameEvent => ({
      id: crypto.randomUUID(),
      seq: ++seqRef.current,
      at: new Date().toISOString(),
      type,
      actorTeamId: identity.teamId ?? undefined,
      actorRole: identity.role,
      visibility: opts?.visibility ?? "public",
      groupId: opts?.groupId,
      payload,
      note: opts?.note,
    }),
    [identity],
  );

  const send = useCallback((batch: GameEvent[]) => {
    // apply locally first so the tap feels instant; the row insert follows
    setEvents((prev) => [...prev, ...batch]);
    const sb = supabase();
    if (!sb) return;
    sb.from(EVENTS_TABLE)
      .insert(batch.map((e) => eventToRow(e, codeRef.current)))
      .then(({ error }) => {
        if (error) console.error("[bob] append failed", error.message);
      });
  }, []);

  // Non-Leader roles don't commit gameplay directly: their submissions become
  // pending proposals that the team Leader (or facilitator) approves.
  const wrapIfProposal = useCallback(
    (
      items: { type: EventType; payload: Record<string, unknown>; note?: string }[],
      opts?: { visibility?: Visibility },
    ): GameEvent[] | null => {
      if (roleCanCommit(identity.role)) return null;
      if (!items.some((it) => GAMEPLAY_TYPES.has(it.type))) return null;
      const summary =
        items
          .map((it) => it.note)
          .filter(Boolean)
          .join(" · ") || items.map((it) => it.type).join(" · ");
      return [
        mkEvent(
          "proposal/submit",
          { summary, items },
          { visibility: opts?.visibility ?? "public", note: `📨 Proposal (awaiting Leader): ${summary}` },
        ),
      ];
    },
    [identity, mkEvent],
  );

  const append: Store["append"] = useCallback(
    (type, payload, opts) => {
      const wrapped = wrapIfProposal([{ type, payload, note: opts?.note }], opts);
      send(wrapped ?? [mkEvent(type, payload, opts)]);
    },
    [mkEvent, send, wrapIfProposal],
  );

  const appendGroup: Store["appendGroup"] = useCallback(
    (items, opts) => {
      const wrapped = wrapIfProposal(items, opts);
      if (wrapped) {
        send(wrapped);
        return;
      }
      const groupId = crypto.randomUUID();
      send(items.map((it) => mkEvent(it.type, it.payload, { ...opts, note: it.note, groupId })));
    },
    [mkEvent, send, wrapIfProposal],
  );

  /** Rewind the last move — a whole group if it was one, on every device. */
  const undo = useCallback(() => {
    setEvents((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const cut = last.groupId
        ? prev.findIndex((e) => e.groupId === last.groupId)
        : prev.length - 1;
      const dropped = prev.slice(cut);
      const sb = supabase();
      if (sb && dropped.length) {
        sb.from(EVENTS_TABLE)
          .delete()
          .in("id", dropped.map((e) => e.id))
          .then(({ error }) => {
            if (error) console.error("[bob] undo failed", error.message);
          });
      }
      return prev.slice(0, cut);
    });
  }, []);

  /**
   * Start over. The old rows are left in Postgres and a fresh code is taken,
   * which is both cheaper than a wide delete and recoverable if somebody
   * clears the wrong table by mistake.
   */
  const resetSession = useCallback(() => {
    // index this session before the code rotates, so it stays findable
    void archiveSession(codeRef.current, reduceEvents(eventsRef.current), eventsRef.current);
    setEvents([]);
    sessionStorage.removeItem(IDENTITY_KEY);
    localStorage.removeItem(STORAGE_KEY);
    rotateSessionCode();
    location.href = location.pathname;
  }, []);

  const exportSession = useCallback(() => {
    const file: SessionFile = {
      app: "bridge-or-bricks",
      formatVersion: 1,
      savedAt: new Date().toISOString(),
      events,
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bridge-or-bricks-session-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [events]);

  const importSession = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as SessionFile;
    if (parsed.app !== "bridge-or-bricks" || !Array.isArray(parsed.events)) {
      throw new Error("Not a Bridge or Bricks session file");
    }
    // an imported file becomes a new table of its own, so restoring a backup
    // never overwrites a game that is currently being played
    const code = rotateSessionCode();
    codeRef.current = code;
    const sb = supabase();
    if (sb) {
      const { error } = await sb
        .from(EVENTS_TABLE)
        .insert(parsed.events.map((e) => eventToRow(e, code)));
      if (error) console.error("[bob] import failed", error.message);
    }
    setEvents(parsed.events);
  }, []);

  const value: Store = {
    events,
    state,
    identity,
    sync,
    setIdentity,
    append,
    appendGroup,
    undo,
    canUndo: events.length > 1,
    resetSession,
    exportSession,
    importSession,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
