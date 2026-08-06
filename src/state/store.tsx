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
import { serviceUrl } from "../net";

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<GameEvent[]>(loadLocalEvents);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const [identity, setIdentityState] = useState<ActiveIdentity>(loadIdentity);
  const wsRef = useRef<WebSocket | null>(null);
  const pushedLocalRef = useRef(false);
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

  // relay connection
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;
      setSync((s) => (s === "connected" ? s : "connecting"));
      const ws = new WebSocket(serviceUrl(RELAY_PORT, "ws"));
      wsRef.current = ws;
      ws.onopen = () => setSync("connected");
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data as string);
          if (msg.type === "log") {
            const serverEvents = msg.events as GameEvent[];
            // first contact: if relay is empty but this device has a session, seed it
            if (!pushedLocalRef.current) {
              pushedLocalRef.current = true;
              const local = loadLocalEvents();
              if (serverEvents.length === 0 && local.length > 0) {
                ws.send(JSON.stringify({ type: "append", events: local }));
                return;
              }
            }
            setEvents(serverEvents);
          }
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        // Only react if this is still the active socket (StrictMode double-mount
        // creates a discarded first socket whose close must not clobber the live one).
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setSync("offline");
        retry = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const state = useMemo(() => reduceEvents(events), [events]);

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
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "append", events: batch }));
    }
    // optimistic local apply; server broadcast will replace with canonical order
    setEvents((prev) => [...prev, ...batch]);
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

  const undo = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "undo" }));
      return;
    }
    setEvents((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const cut = last.groupId ? prev.findIndex((e) => e.groupId === last.groupId) : prev.length - 1;
      return prev.slice(0, cut);
    });
  }, []);

  const resetSession = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "reset" }));
    setEvents([]);
    sessionStorage.removeItem(IDENTITY_KEY);
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
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "reset" }));
      ws.send(JSON.stringify({ type: "append", events: parsed.events }));
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
