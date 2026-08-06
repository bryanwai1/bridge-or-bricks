import { useState } from "react";
import { verifyPasscode, unlock } from "../data/admin";
import { sfx, unlockAudio } from "../audio/sfx";

/**
 * Stands in front of anything the Facilitator can do. Shown when a device
 * asks for the Facilitator role and has not unlocked this session yet.
 */
export default function AdminGate({
  adminHash,
  sessionCode,
  onPass,
  onCancel,
}: {
  adminHash: string | undefined;
  sessionCode: string;
  onPass: () => void;
  onCancel: () => void;
}) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const ok = await verifyPasscode(pass, adminHash);
    setBusy(false);
    if (!ok) {
      sfx.denied();
      setPass("");
      setError("That passcode does not match.");
      return;
    }
    unlockAudio();
    sfx.approve();
    unlock(sessionCode);
    onPass();
  };

  return (
    <div className="admin-gate" role="dialog" aria-modal="true">
      <div className="admin-card">
        <span className="admin-emblem">🔐</span>
        <h1>Facilitator access</h1>
        <p className="muted">
          The Facilitator overrides the turn order, the deck gates and the placement rules,
          and can see every team's PIN. Enter the session passcode to continue.
        </p>
        <input
          className="admin-input"
          type="password"
          inputMode="text"
          autoComplete="off"
          placeholder="Passcode"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        {error && <p className="admin-error">{error}</p>}
        <button className="primary" onClick={submit} disabled={busy || !pass.trim()}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <button className="chip" onClick={onCancel}>
          Back — I'm a player
        </button>
      </div>
    </div>
  );
}
