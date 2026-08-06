/**
 * Where do the other pieces of the app live?
 *
 * On a LAN the relay is a port on the same machine: http://192.168.1.5:5200.
 * In a cloud dev environment (Codespaces, Gitpod) every port is forwarded to
 * its OWN subdomain over https instead — <name>-5200.app.github.dev — so
 * "same host, different port" is wrong there and nothing connects.
 *
 * Everything that needs to reach the relay or build a join link goes through
 * here, so there is exactly one place to change when hosting changes.
 */

const CLOUD_HOST = /^(.*)-(\d+)\.(app\.github\.dev|githubpreview\.dev|gitpod\.io)$/;

/** True when the app is served from a forwarded cloud port. */
export function isCloudHosted(): boolean {
  return CLOUD_HOST.test(location.hostname);
}

/** Base URL for a sibling service on the given port, http(s) or ws(s). */
export function serviceUrl(port: number, scheme: "http" | "ws"): string {
  const m = location.hostname.match(CLOUD_HOST);
  if (m) {
    // cloud: swap the port segment of the subdomain, always TLS
    const secure = scheme === "ws" ? "wss" : "https";
    return `${secure}://${m[1]}-${port}.${m[3]}`;
  }
  const plain = scheme === "ws" ? "ws" : "http";
  return `${plain}://${location.hostname}:${port}`;
}

/**
 * The URL a player's phone should open to join a team.
 *
 * Cloud: this origin already works from anywhere, including mobile data —
 * no shared wifi needed, provided the port is set to Public visibility.
 * LAN: the phone cannot use "localhost", so the relay tells us the host's
 * real address and we use that instead.
 */
export function joinUrl(teamId: string, lanIp: string | null): string {
  if (isCloudHosted()) return `${location.origin}/?team=${teamId}`;
  const host = lanIp ?? location.hostname;
  return `http://${host}:${location.port || "5173"}/?team=${teamId}`;
}
