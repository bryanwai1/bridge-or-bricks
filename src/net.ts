/**
 * Where does a player's phone need to go?
 *
 * There used to be a second service on port 5200 and this file existed to
 * find it. That relay is gone — Supabase carries the sync now — so the only
 * question left is what URL to put inside a join QR code.
 *
 * The answer is almost always "this origin". It stops being true only when
 * the app is served from localhost or a bare LAN address, because a phone
 * cannot resolve "localhost" and will not see 127.0.0.1.
 */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)$/i;
const LAN_IP = /^(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\./;

/**
 * True when this origin is reachable from any phone on any network —
 * Vercel, Codespaces, a real domain. False for localhost and LAN IPs.
 */
export function isPubliclyReachable(): boolean {
  const h = location.hostname;
  if (LOCAL_HOST.test(h)) return false;
  if (LAN_IP.test(h)) return false;
  return true;
}

/** Kept under the old name so existing call sites keep reading naturally. */
export const isCloudHosted = isPubliclyReachable;

/**
 * The URL a player's phone should open to join a team.
 *
 * The session code rides along so a scanned QR lands on the right table even
 * if that phone was in a different game earlier.
 */
export function joinUrl(teamId: string, lanIp: string | null, code?: string): string {
  const q = code ? `?s=${code}&team=${teamId}` : `?team=${teamId}`;
  if (isPubliclyReachable()) return `${location.origin}/${q}`;
  // developing on localhost: the phone needs the machine's LAN address, and
  // port 5173 is Vite's, not a service of ours
  const host = lanIp ?? location.hostname;
  return `${location.protocol}//${host}:${location.port || "5173"}/${q}`;
}
