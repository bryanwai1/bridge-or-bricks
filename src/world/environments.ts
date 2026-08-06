/**
 * The world the table sits in.
 *
 * Each environment is a 2:1 equirectangular panorama painted onto a canvas at
 * runtime and handed to Three.js as a texture. Nothing is downloaded — same
 * approach as the audio engine and the forest Backdrop, so the whole app stays
 * a single bundle and new environments cost nothing but code.
 *
 * Convention: v = 1 (top of the image) is the zenith, v = 0 (bottom) is the
 * ground directly under the table, horizon across the middle. That is the
 * standard equirectangular layout, and it is what the existing harbour
 * photograph uses, so every environment orients identically.
 */

export type EnvKey = "harbour" | "dusk" | "night" | "storm" | "grove" | "none";

export interface EnvDef {
  key: EnvKey;
  label: string;
  /** Swatch for the picker chip. */
  swatch: string;
  /** A file under /public, or null when the panorama is generated. */
  src?: string;
}

export const ENVIRONMENTS: EnvDef[] = [
  { key: "grove", label: "Grove", swatch: "#4E8C5A" },
  { key: "dusk", label: "Dusk", swatch: "#E0894A" },
  { key: "storm", label: "Storm", swatch: "#9E262C" },
  { key: "night", label: "Night", swatch: "#2A3B5C" },
  { key: "harbour", label: "Harbour", swatch: "#8C7B63", src: "assets/sky.webp" },
  { key: "none", label: "Off", swatch: "#1a1712" },
];

const W = 2048;
const H = 1024;

/** Deterministic noise, so the same environment looks the same every session. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function vGradient(
  g: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  stops: [number, string][],
) {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
}

/** A ragged silhouette band sitting on the horizon — hills, trees, ruins. */
function ridge(
  g: CanvasRenderingContext2D,
  seed: number,
  baseY: number,
  height: number,
  colour: string,
  spikiness: number,
) {
  const r = rng(seed);
  const phases = Array.from({ length: 5 }, () => r() * Math.PI * 2);
  const freqs = [1, 2.3, 4.7, 9.1, 17.3];
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) {
    const u = (x / W) * Math.PI * 2;
    let h = 0;
    for (let i = 0; i < 5; i++) {
      h += Math.sin(u * freqs[i] + phases[i]) / (i + 1);
    }
    // wrap-safe: the sum of whole-period sines is continuous across the seam
    const y = baseY - height * (0.45 + 0.55 * (h / 2.28)) * spikiness;
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

function sunGlow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  inner: string,
  outer: string,
) {
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function stars(g: CanvasRenderingContext2D, seed: number, count: number) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    // bias toward the zenith; stars crowded at the pole look wrong
    const y = Math.pow(r(), 1.7) * H * 0.48;
    const s = r();
    g.globalAlpha = 0.25 + s * 0.75;
    g.fillStyle = s > 0.93 ? "#CFE3FF" : "#FFFFFF";
    g.beginPath();
    g.arc(x, y, s > 0.95 ? 2.2 : s > 0.8 ? 1.4 : 0.9, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Broken reflective banding, for water under the table. */
function water(g: CanvasRenderingContext2D, seed: number, top: number, tint: string) {
  const r = rng(seed);
  g.save();
  g.globalAlpha = 0.16;
  g.strokeStyle = tint;
  for (let i = 0; i < 220; i++) {
    const y = top + Math.pow(r(), 0.6) * (H - top);
    const x = r() * W;
    const len = 30 + r() * 260;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y);
    g.stroke();
  }
  g.restore();
}

type Painter = (g: CanvasRenderingContext2D) => void;

const PAINTERS: Record<Exclude<EnvKey, "harbour" | "none">, Painter> = {
  /* Act 1 — a clearing at the edge of the forest, light coming through */
  grove: (g) => {
    vGradient(g, 0, H * 0.5, [
      [0, "#0B1F14"],
      [0.55, "#1B3A28"],
      [1, "#5C8A5E"],
    ]);
    vGradient(g, H * 0.5, H, [
      [0, "#3D5A3A"],
      [0.35, "#22331F"],
      [1, "#0A120A"],
    ]);
    sunGlow(g, W * 0.22, H * 0.47, 420, "rgba(214,240,170,0.45)", "rgba(214,240,170,0)");
    sunGlow(g, W * 0.74, H * 0.5, 300, "rgba(159,217,138,0.22)", "rgba(159,217,138,0)");
    ridge(g, 11, H * 0.53, 120, "#16301F", 1);
    ridge(g, 29, H * 0.55, 78, "#0D1F14", 1.25);
  },

  /* Act 2 — low sun, dust, the pressure building */
  dusk: (g) => {
    vGradient(g, 0, H * 0.5, [
      [0, "#120D07"],
      [0.45, "#3B2410"],
      [0.82, "#A65A24"],
      [1, "#F0A44A"],
    ]);
    vGradient(g, H * 0.5, H, [
      [0, "#C97A38"],
      [0.3, "#4B2C13"],
      [1, "#140C05"],
    ]);
    sunGlow(g, W * 0.62, H * 0.5, 560, "rgba(255,214,138,0.6)", "rgba(255,140,60,0)");
    ridge(g, 7, H * 0.52, 96, "#2A1809", 1);
    ridge(g, 43, H * 0.535, 62, "#160C04", 1.2);
  },

  /* Act 3 — convergence: heavy cloud with fire underneath */
  storm: (g) => {
    vGradient(g, 0, H * 0.5, [
      [0, "#0A0708"],
      [0.5, "#241417"],
      [0.88, "#4A1F22"],
      [1, "#6E2A28"],
    ]);
    vGradient(g, H * 0.5, H, [
      [0, "#5E2321"],
      [0.28, "#2A1010"],
      [1, "#0B0505"],
    ]);
    sunGlow(g, W * 0.4, H * 0.51, 640, "rgba(240,104,90,0.34)", "rgba(240,104,90,0)");
    sunGlow(g, W * 0.86, H * 0.49, 340, "rgba(255,176,138,0.2)", "rgba(255,176,138,0)");
    // torn cloud bands across the upper sky
    const r = rng(97);
    g.globalAlpha = 0.2;
    g.fillStyle = "#0A0506";
    for (let i = 0; i < 26; i++) {
      const y = Math.pow(r(), 1.4) * H * 0.46;
      g.fillRect(r() * W - W * 0.2, y, W * (0.3 + r() * 0.6), 6 + r() * 26);
    }
    g.globalAlpha = 1;
    ridge(g, 5, H * 0.53, 110, "#1A0A0B", 1.15);
  },

  /* A calm night — good for a debrief, or a session that runs long */
  night: (g) => {
    vGradient(g, 0, H * 0.5, [
      [0, "#050810"],
      [0.6, "#0D1730"],
      [1, "#233A5C"],
    ]);
    vGradient(g, H * 0.5, H, [
      [0, "#1B2C46"],
      [0.35, "#0B1220"],
      [1, "#04060B"],
    ]);
    stars(g, 3, 900);
    sunGlow(g, W * 0.3, H * 0.28, 200, "rgba(226,236,255,0.5)", "rgba(226,236,255,0)");
    sunGlow(g, W * 0.3, H * 0.28, 46, "rgba(255,255,255,0.95)", "rgba(255,255,255,0.2)");
    water(g, 61, H * 0.5, "#9DBBE8");
    ridge(g, 17, H * 0.52, 70, "#070C16", 1);
  },
};

const cache = new Map<EnvKey, HTMLCanvasElement>();

/** Paint (once) and return the panorama for an environment. */
export function environmentCanvas(key: EnvKey): HTMLCanvasElement | null {
  if (key === "none" || key === "harbour") return null;
  const hit = cache.get(key);
  if (hit) return hit;

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  if (!g) return null;
  PAINTERS[key](g);
  cache.set(key, cv);
  return cv;
}

export function environmentSrc(key: EnvKey): string | undefined {
  return ENVIRONMENTS.find((e) => e.key === key)?.src;
}

/** Which world suits the act the table has reached. */
export function envForAct(act: 1 | 2 | 3): EnvKey {
  return act === 3 ? "storm" : act === 2 ? "dusk" : "grove";
}
