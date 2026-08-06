/* Bridge or Bricks — ambience.
   The bed under everything: wind, water, birds in Act 1; the same
   world souring through Act 2 and 3. Synthesised, no files.

   Kept separate from audio/sfx.ts because that module is one-shots
   with its own lifetime. This one loops until told to stop, and
   shares the same "bob-muted" preference. */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let running = false;
let act: 1 | 2 | 3 = 1;

let wind: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
let water: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let drone: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let voiceTimer: ReturnType<typeof setTimeout> | null = null;

const KEY = "bob-ambience";

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function brownNoise(c: AudioContext, sec: number) {
  const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3;
  }
  return b;
}

/** Act 1 birdsong · Act 2 a distant crow · Act 3 a wolf. */
function voice() {
  const c = ctx;
  if (!running || !c || !bus) return;
  const t = c.currentTime;

  if (act === 1) {
    const base = 1500 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const o = c.createOscillator(), g = c.createGain(), at = t + i * 0.13;
      o.type = "sine";
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.07);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.05, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
      o.connect(g).connect(bus);
      o.start(at); o.stop(at + 0.15);
    }
  } else if (act === 2) {
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain(), at = t + i * 0.28;
      o.type = "sawtooth";
      o.frequency.setValueAtTime(420, at);
      o.frequency.exponentialRampToValueAtTime(260, at + 0.22);
      const f = c.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 2.5;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.045, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
      o.connect(f).connect(g).connect(bus);
      o.start(at); o.stop(at + 0.3);
    }
  } else {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(320, t + 0.5);
    o.frequency.linearRampToValueAtTime(240, t + 1.6);
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1100;
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 5.5; vg.gain.value = 9;
    vib.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    o.connect(f).connect(g).connect(bus);
    o.start(t); vib.start(t);
    o.stop(t + 2.1); vib.stop(t + 2.1);
  }

  const gap = act === 1 ? 4500 + Math.random() * 9000
            : act === 2 ? 7000 + Math.random() * 11000
            : 9000 + Math.random() * 14000;
  voiceTimer = setTimeout(voice, gap);
}

/** Retune the running bed without restarting it. */
function retune() {
  const c = ctx;
  if (!c || !running) return;
  const t = c.currentTime;
  if (wind) {
    wind.filt.frequency.setTargetAtTime(act === 1 ? 420 : act === 2 ? 640 : 900, t, 1.2);
    wind.gain.gain.setTargetAtTime(act === 1 ? 0.11 : act === 2 ? 0.15 : 0.19, t, 1.2);
  }
  if (water) water.gain.gain.setTargetAtTime(act === 1 ? 0.028 : act === 2 ? 0.014 : 0.004, t, 1.5);
  if (drone) drone.gain.gain.setTargetAtTime(act === 1 ? 0 : act === 2 ? 0.02 : 0.05, t, 2);
}

export const ambience = {
  get isOn() { return running; },

  /** Must be called from a click — browsers block audio otherwise. */
  start() {
    const c = audio();
    if (!c || !bus || running) return;
    running = true;

    // wind: brown noise through a slowly breathing lowpass
    const src = c.createBufferSource();
    src.buffer = brownNoise(c, 6); src.loop = true;
    const filt = c.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 420;
    const gain = c.createGain(); gain.gain.value = 0.11;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
    const lg = c.createGain(); lg.gain.value = 190;
    lfo.connect(lg).connect(filt.frequency);
    src.connect(filt).connect(gain).connect(bus);
    src.start(); lfo.start();
    wind = { src, filt, gain };

    // the stream
    const w = c.createBufferSource();
    w.buffer = brownNoise(c, 4); w.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.7;
    const wg = c.createGain(); wg.gain.value = 0.028;
    w.connect(bp).connect(wg).connect(bus);
    w.start();
    water = { src: w, gain: wg };

    // the unease that grows in Act 2 and 3 — silent in Act 1
    const dg = c.createGain(); dg.gain.value = 0;
    const oscs = [55, 58.27].map((f) => {
      const o = c.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
      o.connect(lp).connect(dg);
      o.start();
      return o;
    });
    dg.connect(bus);
    drone = { osc: oscs, gain: dg };

    retune();
    bus.gain.setTargetAtTime(0.55, c.currentTime, 1.4);   // fade in, never a jolt
    voiceTimer = setTimeout(voice, 2200);
    localStorage.setItem(KEY, "1");
  },

  stop() {
    if (!running || !ctx || !bus) return;
    running = false;
    if (voiceTimer) clearTimeout(voiceTimer);
    const c = ctx;
    bus.gain.setTargetAtTime(0, c.currentTime, 0.5);
    setTimeout(() => {
      try { wind?.src.stop(); water?.src.stop(); drone?.osc.forEach((o) => o.stop()); } catch { /* stopped */ }
      wind = water = drone = null;
    }, 1600);
    localStorage.setItem(KEY, "0");
  },

  toggle() { running ? ambience.stop() : ambience.start(); return running; },

  /** Called by setAct — the bed follows the palette. */
  setAct(a: 1 | 2 | 3) { act = a; retune(); },

  /** Was it on last session? Used to offer, never to autoplay. */
  wasOn() { return localStorage.getItem(KEY) === "1"; },
};

/** Repaint the world and retune the bed together. */
export function setAct(a: 1 | 2 | 3) {
  document.documentElement.dataset.act = String(a);
  localStorage.setItem("bob-act", String(a));
  ambience.setAct(a);
}

export function currentAct(): 1 | 2 | 3 {
  const v = Number(localStorage.getItem("bob-act") ?? document.documentElement.dataset.act ?? 1);
  return (v === 2 || v === 3 ? v : 1) as 1 | 2 | 3;
}
