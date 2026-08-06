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

export async function hashPasscode(pass: string): Promise<string> {
  const data = new TextEncoder().encode(`bob:v1:${pass.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPasscode(pass: string, hash: string | undefined): Promise<boolean> {
  if (!hash) return true; // session created before passcodes existed
  return (await hashPasscode(pass)) === hash;
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
