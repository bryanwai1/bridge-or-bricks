import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../state/store";
import { isPubliclyReachable, joinUrl } from "../net";
import { sessionCode } from "../net/supabase";

export default function ShareScreen() {
  const { state } = useStore();
  /* Only meaningful when developing on localhost: without a relay to ask,
     the machine's LAN address has to be typed in by hand. Deployed, the
     origin already works and this stays null. */
  const [ip, setIp] = useState<string | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  const cloud = isPubliclyReachable();
  const code = sessionCode();


  useEffect(() => {
    if (!cloud && !ip) return;
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const tid of state.teamOrder) {
        out[tid] = await QRCode.toDataURL(joinUrl(tid, ip, code), { width: 360, margin: 1 });
      }
      if (alive) setQrs(out);
    })();
    return () => {
      alive = false;
    };
  }, [cloud, ip, code, state.teamOrder]);

  return (
    <div className="stack">
      <div className="card">
        <b>📱 Team join QR codes</b>
        <p className="session-code">
          Session <b>{code}</b>
        </p>
        <p className="muted small">
          {cloud
            ? "Hosted in the cloud — players scan their team's QR from any network, including mobile data. No shared wifi needed."
            : "Players connect to the same wifi/hotspot as this computer, scan their team's QR, enter the team PIN, and pick a role. Their devices stay live-synced with this board and the projector."}
        </p>
        {cloud ? (
          <p className="small">
            Host: <code>{location.origin}</code>
          </p>
        ) : (
          ip && (
            <p className="small">
              Host: <code>http://{ip}:{location.port || "5173"}</code>
            </p>
          )
        )}
        {!cloud && (
          <label className="lan-row">
            <span className="small">
              Serving from <code>{location.hostname}</code> — a phone cannot reach that.
              Type this computer's LAN address to make the QR codes work.
            </span>
            <input
              className="setup-input"
              placeholder="192.168.1.x"
              value={ip ?? ""}
              onChange={(e) => setIp(e.target.value.trim() || null)}
            />
          </label>
        )}
        {cloud && (
          <p className="rv-tag">
            ⚠️ Set both forwarded ports (5173 and 5200) to <b>Public</b> in the Ports tab,
            or phones will hit a GitHub sign-in wall.
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
        Show this screen to the room, or each team privately for their PIN.
        {cloud
          ? " Running in the cloud already gives you cross-network play, so the Firebase upgrade is no longer needed for this."
          : " Different-wifi / mobile-data play works out of the box when the app is hosted in the cloud."}
      </p>
    </div>
  );
}
