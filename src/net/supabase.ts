import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cloud sync.
 *
 * Replaces server/relay.mjs. The relay held the event log in one Node
 * process's memory, which meant the game died with the terminal, could not be
 * hosted anywhere static, and needed every device on the same wifi. Postgres
 * holds it now, and Realtime pushes new rows to every device.
 *
 * The anon key is public by design — it ships inside the JavaScript bundle
 * either way. What actually separates one table's game from another's is the
 * session code, and what the key may do is fenced by row-level security in
 * supabase/schema.sql.
 */

const URL_ENV = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const CLOUD_READY = Boolean(URL_ENV && KEY_ENV);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!CLOUD_READY) return null;
  if (!client) {
    client = createClient(URL_ENV!, KEY_ENV!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

export const EVENTS_TABLE = "bob_events";

/* ------------------------------------------------------------------ */
/* SESSION CODES                                                       */
/* ------------------------------------------------------------------ */

const CODE_KEY = "bob-session-code";
/* No vowels and no 0/O/1/I: these get read aloud across a training room. */
const ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export function newSessionCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * Which game is this device looking at?
 *
 * A ?s= in the URL wins, so a scanned QR always lands on the right table
 * even if the phone was in a different session earlier.
 */
export function sessionCode(): string {
  const fromUrl = new URLSearchParams(location.search).get("s");
  if (fromUrl) {
    const clean = fromUrl.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (clean) {
      localStorage.setItem(CODE_KEY, clean);
      return clean;
    }
  }
  const saved = localStorage.getItem(CODE_KEY);
  if (saved) return saved;
  const fresh = newSessionCode();
  localStorage.setItem(CODE_KEY, fresh);
  return fresh;
}

export function setSessionCode(code: string) {
  localStorage.setItem(CODE_KEY, code.toUpperCase());
}

/** Start a brand new table, leaving the old rows where they are. */
export function rotateSessionCode(): string {
  const fresh = newSessionCode();
  localStorage.setItem(CODE_KEY, fresh);
  return fresh;
}
