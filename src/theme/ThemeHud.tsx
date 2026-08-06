import { useEffect, useState } from "react";
import { ambience, setAct, currentAct } from "./ambience";
import { isMuted, toggleMute, unlockAudio } from "../audio/sfx";

/**
 * ThemeHud — the two controls that belong to the world rather than
 * to any one screen: the Act, and the sound.
 *
 * Sits bottom-right on every screen. Mounted once in App.
 */
export default function ThemeHud() {
  const [act, setActState] = useState<1 | 2 | 3>(() => currentAct());
  const [amb, setAmb] = useState(false);
  const [mute, setMute] = useState(() => isMuted());
  const [open, setOpen] = useState(false);

  // restore the saved act on first paint
  useEffect(() => { setAct(act); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cycleAct = () => {
    const next = ((act % 3) + 1) as 1 | 2 | 3;
    setAct(next);
    setActState(next);
  };

  const toggleAmbience = () => {
    unlockAudio();
    setAmb(ambience.toggle());
  };

  const ACT_LABEL = { 1: "Growth", 2: "Pressure", 3: "Convergence" } as const;

  return (
    <div className={open ? "theme-hud open" : "theme-hud"}>
      <button
        className="hud-btn hud-toggle"
        onClick={() => setOpen((o) => !o)}
        title="World controls"
        aria-expanded={open}
      >
        ✦
      </button>

      <div className="hud-panel">
        <button className="hud-btn hud-act" onClick={cycleAct} title="Change the Act">
          <b>Act {act}</b>
          <i>{ACT_LABEL[act]}</i>
        </button>

        <button
          className={amb ? "hud-btn on" : "hud-btn"}
          onClick={toggleAmbience}
          title="Forest ambience"
        >
          {amb ? "♪ Ambience on" : "♪ Ambience off"}
        </button>

        <button
          className={mute ? "hud-btn" : "hud-btn on"}
          onClick={() => { unlockAudio(); setMute(toggleMute()); }}
          title="Interface sounds"
        >
          {mute ? "🔇 Effects off" : "🔊 Effects on"}
        </button>
      </div>
    </div>
  );
}
