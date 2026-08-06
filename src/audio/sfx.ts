/* Bridge or Bricks — synthesised sound.
   Every texture below is generated at runtime by the Web Audio API. No audio
   files, no hosting, no licensing. Browsers block audio until the first user
   gesture; unlockAudio() handles that. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem("bob-muted") === "1";

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  audio();
}
export function isMuted() {
  return muted;
}
export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem("bob-muted", muted ? "1" : "0");
  if (!muted) unlockAudio();
  return muted;
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, to, dur = 0.14, type = "sine", gain = 0.3, delay = 0 }: ToneOpts) {
  const c = audio();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A pitch that travels through several points — used for howls and sweeps. */
function glide(
  points: [number, number][],
  {
    type = "sawtooth",
    gain = 0.2,
    dur = 1.2,
    delay = 0,
    vibrato = 0,
  }: {
    type?: OscillatorType;
    gain?: number;
    dur?: number;
    delay?: number;
    vibrato?: number;
  } = {},
) {
  const c = audio();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  for (const [frac, f] of points) osc.frequency.linearRampToValueAtTime(f, t + frac * dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.14);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  dur?: number;
  gain?: number;
  cutoff?: number;
  delay?: number;
  sweepTo?: number;
  type?: BiquadFilterType;
  q?: number;
  fade?: "out" | "swell";
}

function noise({
  dur = 0.25,
  gain = 0.25,
  cutoff = 1200,
  delay = 0,
  sweepTo = 0,
  type = "lowpass",
  q = 1,
  fade = "out",
}: NoiseOpts) {
  const c = audio();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutoff, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
  const g = c.createGain();
  if (fade === "swell") {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

/* ============================ ambient textures ============================ */

const texture = {
  /** Wolves. Two voices, slightly detuned, so it reads as a pack. */
  howl: () => {
    glide([[0, 300], [0.25, 680], [0.6, 640], [1, 260]], { gain: 0.2, dur: 1.5, vibrato: 12, type: "sawtooth" });
    glide([[0, 280], [0.3, 620], [0.65, 590], [1, 240]], { gain: 0.13, dur: 1.6, delay: 0.22, vibrato: 9, type: "triangle" });
    noise({ dur: 1.4, gain: 0.05, cutoff: 700, type: "bandpass", q: 0.8, fade: "swell" });
  },

  /** Running water, with a few bubbles on top. */
  water: () => {
    noise({ dur: 1.5, gain: 0.13, cutoff: 900, sweepTo: 1600, type: "bandpass", q: 0.7, fade: "swell" });
    for (let i = 0; i < 7; i++) {
      const f = 500 + Math.random() * 900;
      tone({ freq: f, to: f * 1.7, dur: 0.09, type: "sine", gain: 0.09, delay: 0.15 + Math.random() * 1.1 });
    }
  },

  /** Wind across open ground. */
  wind: () => {
    noise({ dur: 1.7, gain: 0.16, cutoff: 380, sweepTo: 950, type: "lowpass", fade: "swell" });
    noise({ dur: 1.3, gain: 0.07, cutoff: 1600, type: "bandpass", q: 0.5, delay: 0.4, fade: "swell" });
  },

  /** Fire — irregular crackle over a low roar. */
  fire: () => {
    noise({ dur: 1.6, gain: 0.12, cutoff: 500, type: "lowpass", fade: "swell" });
    for (let i = 0; i < 16; i++) {
      noise({
        dur: 0.05,
        gain: 0.12 + Math.random() * 0.12,
        cutoff: 2200 + Math.random() * 2600,
        type: "bandpass",
        q: 3,
        delay: Math.random() * 1.4,
      });
    }
  },

  /** Deep ground movement. */
  rumble: () => {
    tone({ freq: 46, to: 28, dur: 1.8, type: "sine", gain: 0.32 });
    noise({ dur: 1.8, gain: 0.2, cutoff: 220, sweepTo: 70, fade: "swell" });
  },

  /** Skin drums — a settlement, or an approaching war band. */
  drums: (n = 4) => {
    for (let i = 0; i < n; i++) {
      tone({ freq: 92, to: 46, dur: 0.24, type: "sine", gain: 0.3, delay: i * 0.27 });
      noise({ dur: 0.09, gain: 0.14, cutoff: 500, delay: i * 0.27 });
    }
  },

  /** A handful of chirps. */
  birds: () => {
    for (let i = 0; i < 5; i++) {
      const f = 2000 + Math.random() * 1400;
      tone({ freq: f, to: f * 1.5, dur: 0.06, type: "sine", gain: 0.07, delay: 0.2 + Math.random() * 1.1 });
    }
  },

  /** Old growth — slow and hollow. */
  chimes: () => {
    [392, 523.25, 659.25].forEach((f, i) => tone({ freq: f, dur: 1.1, type: "sine", gain: 0.16, delay: i * 0.19 }));
    tone({ freq: 98, dur: 1.6, type: "sine", gain: 0.14 });
  },

  /** Something wrong in the air. */
  eerie: () => {
    glide([[0, 420], [0.5, 396], [1, 300]], { type: "sine", gain: 0.16, dur: 1.6, vibrato: 4 });
    glide([[0, 297], [1, 213]], { type: "triangle", gain: 0.1, dur: 1.7, delay: 0.1 });
  },

  /** A market at work. */
  market: () => {
    for (let i = 0; i < 5; i++) {
      tone({ freq: 880 + Math.random() * 500, dur: 0.07, type: "sine", gain: 0.12, delay: i * 0.13 });
      tone({ freq: 1320 + Math.random() * 400, dur: 0.1, type: "sine", gain: 0.08, delay: i * 0.13 + 0.05 });
    }
  },

  /** Steel meeting steel. */
  clash: () => {
    for (let i = 0; i < 3; i++) {
      noise({ dur: 0.22, gain: 0.2, cutoff: 4200, type: "bandpass", q: 2, delay: i * 0.16 });
      tone({ freq: 1800 - i * 200, to: 700, dur: 0.2, type: "square", gain: 0.09, delay: i * 0.16 });
    }
  },
};

export const sfx = {
  tap: () => tone({ freq: 620, dur: 0.05, type: "triangle", gain: 0.12 }),
  whoosh: () => noise({ dur: 0.22, gain: 0.12, cutoff: 2600, sweepTo: 500 }),

  /** One turn of the card. Fires three times during the reveal. */
  flip: () => {
    noise({ dur: 0.12, gain: 0.18, cutoff: 3600, sweepTo: 1100 });
    tone({ freq: 380, to: 820, dur: 0.12, type: "triangle", gain: 0.13, delay: 0.02 });
  },

  /** The hologram opening up. */
  project: () => {
    glide([[0, 180], [1, 1400]], { type: "sine", gain: 0.14, dur: 0.5 });
    tone({ freq: 1760, dur: 0.5, type: "sine", gain: 0.07, delay: 0.22 });
    noise({ dur: 0.5, gain: 0.07, cutoff: 3000, type: "bandpass", q: 1.5, fade: "swell" });
  },

  place: () => {
    tone({ freq: 190, to: 90, dur: 0.16, type: "square", gain: 0.2 });
    noise({ dur: 0.12, gain: 0.2, cutoff: 900 });
  },
  brick: (i = 0) => tone({ freq: 480 + i * 60, dur: 0.1, type: "triangle", gain: 0.2, delay: i * 0.06 }),
  coin: () => {
    tone({ freq: 980, dur: 0.09, type: "sine", gain: 0.22 });
    tone({ freq: 1470, dur: 0.14, type: "sine", gain: 0.16, delay: 0.07 });
  },
  build: () => {
    tone({ freq: 150, to: 260, dur: 0.18, type: "sawtooth", gain: 0.16 });
    noise({ dur: 0.2, gain: 0.16, cutoff: 700 });
  },
  crumble: () => {
    noise({ dur: 0.6, gain: 0.3, cutoff: 1600, sweepTo: 120 });
    tone({ freq: 130, to: 44, dur: 0.5, type: "sawtooth", gain: 0.2 });
  },
  orange: () => {
    tone({ freq: 420, to: 300, dur: 0.3, type: "triangle", gain: 0.2 });
    tone({ freq: 317, dur: 0.32, type: "sine", gain: 0.12, delay: 0.06 });
  },
  red: () => {
    tone({ freq: 220, to: 82, dur: 0.75, type: "sawtooth", gain: 0.26 });
    tone({ freq: 233, to: 87, dur: 0.75, type: "sawtooth", gain: 0.18, delay: 0.02 });
    noise({ dur: 0.7, gain: 0.16, cutoff: 900, sweepTo: 160, delay: 0.05 });
  },
  decoy: () => {
    tone({ freq: 700, dur: 0.1, type: "sine", gain: 0.2 });
    tone({ freq: 300, to: 150, dur: 0.4, type: "sine", gain: 0.18, delay: 0.1 });
  },
  gate: () => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: "triangle", gain: 0.24, delay: i * 0.11 });
      tone({ freq: f * 2, dur: 0.4, type: "sine", gain: 0.1, delay: i * 0.11 + 0.02 });
    });
    tone({ freq: 130.8, dur: 1.6, type: "sine", gain: 0.2, delay: 0.1 });
  },
  round: () => {
    tone({ freq: 392, dur: 0.18, type: "triangle", gain: 0.2 });
    tone({ freq: 523.25, dur: 0.26, type: "triangle", gain: 0.2, delay: 0.11 });
  },
  denied: () => {
    tone({ freq: 200, dur: 0.1, type: "square", gain: 0.18 });
    tone({ freq: 150, dur: 0.16, type: "square", gain: 0.18, delay: 0.09 });
  },
  approve: () => {
    tone({ freq: 587, dur: 0.1, type: "sine", gain: 0.2 });
    tone({ freq: 880, dur: 0.18, type: "sine", gain: 0.2, delay: 0.08 });
  },
  texture,
};

/* ---------------------------------------------------------------------------
   What each card sounds like. Wolves howl, rivers run, fires crackle.
   Anything unlisted falls back to its deck's sting.
   ------------------------------------------------------------------------- */
const CARD_SOUND: Record<string, () => void> = {
  GR01: () => { texture.wind(); texture.birds(); },
  GR02: () => texture.water(),
  GR03: () => texture.wind(),
  GR04: () => texture.howl(),
  GR05: () => texture.drums(3),
  GR06: () => texture.market(),
  GR07: () => texture.chimes(),
  GR08: () => { texture.water(); texture.birds(); },
  GR09: () => { sfx.denied(); texture.market(); },
  GR10: () => { sfx.coin(); texture.market(); },

  OR21: () => texture.water(),
  OR26: () => texture.fire(),
  OR29: () => texture.market(),
  OR30: () => texture.market(),

  RD01: () => texture.fire(),
  RD06: () => texture.howl(),
  RD17: () => texture.howl(),
  RD21: () => texture.rumble(),
  RD22: () => { texture.drums(5); texture.clash(); },
  RD23: () => texture.clash(),
  RD24: () => texture.howl(),
  RD26: () => texture.rumble(),
  RD27: () => { texture.wind(); texture.water(); },
  RD28: () => texture.eerie(),

  EG01: () => sfx.gate(),
  EG02: () => sfx.decoy(),
  EG03: () => texture.howl(),
  EG04: () => { texture.drums(5); texture.clash(); },
};

/** The sting that plays the instant a card lands face-up. */
export function playRevealFor(cardId: string) {
  const specific = CARD_SOUND[cardId];
  if (specific) {
    if (cardId.startsWith("RD")) sfx.red();
    else if (cardId.startsWith("OR")) sfx.orange();
    specific();
    return;
  }
  if (cardId.startsWith("RD") || cardId.startsWith("EG")) return sfx.red();
  if (cardId.startsWith("OR")) return sfx.orange();
  sfx.flip();
}
