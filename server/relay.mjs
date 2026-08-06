// Bridge or Bricks — local sync relay.
// One active session; ordered event log; broadcasts full log on every change
// (logs are small at table scale, and full-replace makes ordering trivially safe).
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer } from "ws";

const PORT = 5200;
const DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const FILE = join(DIR, "session.json");
mkdirSync(DIR, { recursive: true });

let events = [];
if (existsSync(FILE)) {
  try {
    events = JSON.parse(readFileSync(FILE, "utf8")).events ?? [];
    console.log(`loaded ${events.length} events from ${FILE}`);
  } catch {
    events = [];
  }
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeFileSync(FILE, JSON.stringify({ savedAt: new Date().toISOString(), events }));
  }, 250);
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/info") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ips: lanIPs(), events: events.length }));
    return;
  }
  res.statusCode = 404;
  res.end("relay");
});

const wss = new WebSocketServer({ server });

function broadcast() {
  const msg = JSON.stringify({ type: "log", events });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  persist();
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "log", events }));
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.type === "append" && Array.isArray(msg.events)) {
      let seq = events.length ? events[events.length - 1].seq : 0;
      for (const ev of msg.events) {
        if (!ev || typeof ev !== "object" || !ev.type) continue;
        ev.seq = ++seq;
        events.push(ev);
      }
      broadcast();
    } else if (msg.type === "undo") {
      if (events.length > 0) {
        const last = events[events.length - 1];
        const cut = last.groupId
          ? events.findIndex((e) => e.groupId === last.groupId)
          : events.length - 1;
        // never undo the session itself unless it is the only event
        if (events[cut]?.type === "session/create" && events.length > 1) return;
        events = events.slice(0, cut);
        broadcast();
      }
    } else if (msg.type === "reset") {
      events = [];
      broadcast();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bridge or Bricks relay on :${PORT} — LAN: ${lanIPs().join(", ") || "none"}`);
});
