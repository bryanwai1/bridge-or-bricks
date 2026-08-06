import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { RELAY_PORT, useStore } from "../state/store";

export default function ShareScreen() {
  const { state } = useStore();
  const [ip, setIp] = useState<string | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`http://${location.hostname}:${RELAY_PORT}/info`)
      .then((r) => r.json())
      .then((info: { ips: string[] }) => {
        const best =
          info.ips.find((i) => i.startsWith("192.168.")) ??
          info.ips.find((i) => i.startsWith("10.")) ??
          info.ips[0] ??
          location.hostname;
        setIp(best);
      })
      .catch(() => setIp(location.hostname));
  }, []);

  useEffect(() => {
    if (!ip) return;
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const tid of state.teamOrder) {
        const url = `http://${ip}:${location.port || "5199"}/?team=${tid}`;
        out[tid] = await QRCode.toDataURL(url, { width: 360, margin: 1 });
      }
      if (alive) setQrs(out);
    })();
    return () => {
      alive = false;
    };
  }, [ip, state.teamOrder]);

  return (
    <div className="stack">
      <div className="card">
        <b>📱 Team join QR codes</b>
        <p className="muted small">
          Players connect to the same wifi/hotspot as this computer, scan their team's QR,
          enter the team PIN, and pick a role. Their devices stay live-synced with this
          board and the projector.
        </p>
        {ip && (
          <p className="small">
            Host: <code>http://{ip}:{location.port || "5199"}</code>
          </p>
        )}
      </div>
      <div className="qr-grid">
        {state.teamOrder.map((tid) => {
          const t = state.teams[tid];
          return (
            <div className="card qr-card" key={tid} style={{ borderTop: `5px solid ${t.config.color}` }}>
              <b style={{ color: t.config.color }}>⬢ {t.config.name}</b>
              {qrs[tid] ? <img src={qrs[tid]} alt={`QR ${t.config.name}`} /> : <p className="muted">…</p>}
              <p className="small">
                PIN: <b className="pin">{t.config.pin ?? "—"}</b>
              </p>
              <p className="muted small">?team={tid}</p>
            </div>
          );
        })}
      </div>
      <p className="muted small">
        Show this screen to the room (or each team privately for PINs). Different-wifi /
        mobile-data play needs the cloud sync upgrade (Firebase) — planned next.
      </p>
    </div>
  );
}
