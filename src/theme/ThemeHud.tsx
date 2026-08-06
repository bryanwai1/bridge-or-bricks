import { useEffect, useState } from "react";
import { ambience, currentAct } from "./ambience";
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

  /* App drives the Act from the game state now, so this only mirrors it.
     Watching the attribute keeps the readout honest without prop drilling. */
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setActState(currentAct());
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-act"] });
    return () => mo.disconnect();
  }, []);

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
        <div className="hud-btn hud-act" title="The Act follows the cards the table has opened">
          <b>Act {act}</b>
          <i>{ACT_LABEL[act]}</i>
        </div>

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
