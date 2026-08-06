/**
 * The admin gate.
 *
 * Team roles are handed out by scanning a QR at the table — deliberately
 * frictionless, because twenty people fumbling passwords kills a session.
 * The Facilitator is different: it overrides the turn lock, the deck gates,
 * the placement rules and the End Game lock, and it can see every team's PIN.
 * That one needs a passcode.
 *
 * What this is honestly worth: the hash lives in the event log, and anon can
 * read the log, so anyone determined enough can pull the hash and attack it
 * offline. A short passcode falls in seconds. It stops a curious participant
 * tapping "Facilitator" in a dropdown, which is the actual threat in a
 * training room — it is not a defence against someone who wants in badly.
 * Real protection would need Supabase Auth and per-role RLS.
 */

const UNLOCK_KEY = "bob-admin-unlocked";

/**
 * The standing passcode.
 *
 * Set once as VITE_ADMIN_HASH — the SHA-256 of whatever you choose — so the
 * same passcode works for every session and nobody has to invent a new one at
 * the start of a workshop. Only the hash is ever built into the bundle, so
 * reading the JavaScript does not hand anyone the passcode.
 */
const GLOBAL_HASH = (import.meta.env.VITE_ADMIN_HASH as string | undefined)
  ?.trim()
  .toLowerCase();

export const HAS_GLOBAL_PASSCODE = Boolean(GLOBAL_HASH && GLOBAL_HASH.length === 64);

export async function hashPasscode(pass: string): Promise<string> {
  const data = new TextEncoder().encode(`bob:v1:${pass.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A passcode is accepted if it matches the standing one, or a per-session one
 * if that session set its own.
 *
 * When neither is configured this returns false rather than true. An earlier
 * version allowed everything through when no hash was found, which quietly
 * left every session created before passcodes existed wide open — a default
 * that fails closed is the only sane one for a gate.
 */
export async function verifyPasscode(pass: string, hash: string | undefined): Promise<boolean> {
  const attempt = await hashPasscode(pass);
  if (GLOBAL_HASH && attempt === GLOBAL_HASH) return true;
  if (hash && attempt === hash) return true;
  return false;
}

/** Nothing configured anywhere — the gate cannot be opened, and says so. */
export function gateIsConfigured(sessionHash: string | undefined): boolean {
  return HAS_GLOBAL_PASSCODE || Boolean(sessionHash);
}

/** Unlocked for this tab only, so a shared laptop does not stay open. */
export function isUnlocked(sessionCode: string): boolean {
  return sessionStorage.getItem(UNLOCK_KEY) === sessionCode;
}

export function unlock(sessionCode: string) {
  sessionStorage.setItem(UNLOCK_KEY, sessionCode);
}

export function lock() {
  sessionStorage.removeItem(UNLOCK_KEY);
}
