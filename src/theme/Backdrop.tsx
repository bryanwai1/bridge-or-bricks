import { useEffect, useRef } from 'react';

/**
 * Backdrop — the living world behind every screen.
 *
 * Canopy, ridge, light shafts, mist, pollen, fireflies, falling
 * leaves, birds and a foreground frame, all generated in code.
 * Nothing is downloaded.
 *
 * Colours come from the CSS custom properties in theme.css
 * (--bob-ink, --bob-deep, --bob-moss, --bob-leaf, --bob-glow,
 * --bob-fire), so changing data-act on <html> repaints the scene.
 *
 * Mount once, near the top of App:
 *   <Backdrop />
 */

type Props = {
  /** 0 = still, 1 = full motion. Default 1. */
  intensity?: number;
  /** Foreground foliage frame. Turn off over the map. */
  frame?: boolean;
};

export default function Backdrop({ intensity = 1, frame = true }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = innerWidth < 700;
    const k = reduce ? 0 : intensity * (small ? 0.55 : 1);

    let W = 0, H = 0, DPR = 1;
    let px = 0, py = 0, tx = 0, ty = 0;

    const css = (v: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#000';
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    /* ----------------------------------------------------------
       A tree: branches, then foliage massed at the tips.
       The foliage is the part that matters — branches alone read
       as a dead winter forest.
       ---------------------------------------------------------- */
    function tree(g: CanvasRenderingContext2D, x0: number, y0: number,
                  len: number, wid: number, density: number) {
      const tips: { x: number; y: number; d: number }[] = [];

      const limb = (x: number, y: number, l: number, ang: number, w: number, depth: number) => {
        if (depth > 4 || l < 7) { tips.push({ x, y, d: depth }); return; }
        const ex = x + Math.cos(ang) * l, ey = y + Math.sin(ang) * l;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(
          x + Math.cos(ang - 0.25) * l * 0.55,
          y + Math.sin(ang - 0.25) * l * 0.55, ex, ey);
        g.stroke();
        if (depth >= 2) tips.push({ x: ex, y: ey, d: depth });
        const n = depth < 2 ? 3 : 2;
        for (let i = 0; i < n; i++)
          limb(ex, ey, l * rnd(0.6, 0.76), ang + rnd(-0.62, 0.62), Math.max(1, w * 0.6), depth + 1);
      };

      g.lineCap = 'round';
      limb(x0, y0, len, -Math.PI / 2 + rnd(-0.15, 0.15), wid, 0);

      /* leaf masses — overlapping blobs clustered on the tips */
      for (const t of tips) {
        const blobs = Math.round(rnd(3, 6) * density);
        const spread = 16 + (5 - t.d) * 9;
        const size = (12 + (5 - t.d) * 5) * density;
        for (let i = 0; i < blobs; i++) {
          const a = rnd(0, 6.283), r = rnd(0, spread);
          g.save();
          g.translate(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.75);
          g.rotate(rnd(0, 6.283));
          g.beginPath();
          g.ellipse(0, 0, size * rnd(0.7, 1.4), size * rnd(0.45, 0.8), 0, 0, 6.283);
          g.fill();
          g.restore();
        }
      }
    }

    function treeLayer(count: number, scale: number, alpha: number, density: number) {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
      const g = c.getContext('2d')!;
      g.strokeStyle = '#000'; g.fillStyle = '#000';
      for (let i = 0; i < count; i++)
        tree(g, (i / count) * 1700 - 50 + rnd(-70, 70), 940,
             rnd(210, 420) * scale, 20 * scale, density);
      return { c, alpha };
    }

    /* a solid canopy ceiling — foliage overhead, not just trunks */
    function canopyLayer() {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
      const g = c.getContext('2d')!; g.fillStyle = '#000';
      for (let i = 0; i < 90; i++) {
        const x = rnd(-60, 1660), y = rnd(-70, 210);
        g.save(); g.translate(x, y); g.rotate(rnd(0, 6.283));
        g.beginPath(); g.ellipse(0, 0, rnd(55, 150), rnd(28, 70), 0, 0, 6.283);
        g.fill(); g.restore();
      }
      return c;
    }

    function ridgeLayer() {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
      const g = c.getContext('2d')!; g.fillStyle = '#000';
      for (let pass = 0; pass < 2; pass++) {
        g.globalAlpha = pass ? 0.55 : 0.35;
        g.beginPath(); g.moveTo(0, 900);
        let y = 560 + pass * 70;
        for (let x = 0; x <= 1600; x += 40) {
          y += rnd(-26, 26);
          y = Math.max(470 + pass * 70, Math.min(660 + pass * 70, y));
          g.lineTo(x, y);
        }
        g.lineTo(1600, 900); g.closePath(); g.fill();
      }
      return c;
    }

    function foreLayer() {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
      const g = c.getContext('2d')!; g.fillStyle = '#000';
      const cluster = (cxp: number, cyp: number, n: number, sc: number) => {
        for (let i = 0; i < n; i++) {
          const a = rnd(0, 6.283), d = rnd(0, 190) * sc;
          g.save();
          g.translate(cxp + Math.cos(a) * d, cyp + Math.sin(a) * d * 0.7);
          g.rotate(rnd(0, 6.283));
          g.beginPath(); g.ellipse(0, 0, rnd(40, 105) * sc, rnd(16, 40) * sc, 0, 0, 6.283);
          g.fill(); g.restore();
        }
      };
      cluster(70, 50, 28, 1); cluster(1530, 40, 28, 1);
      cluster(-20, 870, 20, 1.1); cluster(1620, 890, 20, 1.1);
      return c;
    }

    function makeLeaf() {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d')!; g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(16, 2);
      g.quadraticCurveTo(30, 14, 16, 30);
      g.quadraticCurveTo(2, 14, 16, 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 28); g.stroke();
      return c;
    }

    const ridge = ridgeLayer();
    const canopy = canopyLayer();
    const fore = foreLayer();
    const leafSprite = makeLeaf();
    const layers = [
      treeLayer(10, 0.70, 0.34, 0.8),
      treeLayer(7,  1.00, 0.56, 1.0),
      treeLayer(4,  1.45, 0.86, 1.2),
    ];

    const leafCache: Record<string, HTMLCanvasElement> = {};
    const leafFor = (col: string) => {
      if (leafCache[col]) return leafCache[col];
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d')!;
      g.drawImage(leafSprite, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = col; g.fillRect(0, 0, 32, 32);
      leafCache[col] = c; return c;
    };

    const motes = Array.from({ length: Math.round(60 * k) }, () => ({
      x: Math.random(), y: Math.random(), r: rnd(0.5, 2.1),
      sp: rnd(0.012, 0.05), ph: rnd(0, 6.3), a: rnd(0.2, 0.75),
    }));
    const flies = Array.from({ length: Math.round(16 * k) }, () => ({
      x: Math.random(), y: rnd(0.45, 0.98), ph: rnd(0, 6.3),
      blink: rnd(0.4, 1.1), drift: rnd(-1, 1),
    }));
    const leaves = Array.from({ length: Math.round(14 * k) }, () => ({
      x: Math.random(), y: Math.random(), r: rnd(0, 6.3), vr: rnd(-0.6, 0.6),
      sp: rnd(0.018, 0.05), sw: rnd(20, 60), ph: rnd(0, 6.3), sc: rnd(0.4, 1),
    }));
    const rays = Array.from({ length: 5 }, (_, i) => ({
      x: 0.1 + i * 0.19 + rnd(0, 0.05), w: rnd(0.05, 0.14), a: rnd(0.06, 0.13), ph: rnd(0, 6.3),
    }));
    const birds = Array.from({ length: reduce ? 0 : 3 }, (_, i) => ({
      t: -i * 0.4, y: rnd(0.12, 0.3), sp: rnd(0.02, 0.045),
      dir: Math.random() < 0.5 ? 1 : -1, sc: rnd(0.6, 1),
    }));
    const dapples = Array.from({ length: 4 }, () => ({
      x: Math.random(), y: rnd(0.5, 0.9), r: rnd(0.12, 0.26), ph: rnd(0, 6.3),
    }));

    const resize = () => {
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * DPR; cv.height = H * DPR;
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    };
    addEventListener('resize', resize);
    addEventListener('pointermove', onMove);
    resize();

    const draw = (t: number) => {
      const T = t * 0.001;
      px += (tx - px) * 0.045; py += (ty - py) * 0.045;
      const ink = css('--bob-ink'), deep = css('--bob-deep'), moss = css('--bob-moss');
      const leaf = css('--bob-leaf'), glow = css('--bob-glow'), fire = css('--bob-fire');

      const sky = cx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, deep); sky.addColorStop(0.45, moss); sky.addColorStop(1, ink);
      cx.fillStyle = sky; cx.fillRect(0, 0, W, H);

      const sc = (H / 900) * 1.15, dw = 1600 * sc, dh = 900 * sc, cxo = (W - dw) / 2;

      cx.globalAlpha = 0.3;
      cx.drawImage(ridge, cxo - px * 7, H - dh + 90 - py * 4, dw, dh);
      cx.globalAlpha = 1;

      /* light shafts sit between the far and near canopy */
      cx.save(); cx.globalCompositeOperation = 'screen';
      rays.forEach(r => {
        const x = (r.x + Math.sin(T * 0.18 + r.ph) * 0.035) * W, w = r.w * W;
        const g = cx.createLinearGradient(x, 0, x + w * 0.55, H);
        g.addColorStop(0, glow + '00'); g.addColorStop(0.18, glow + '66'); g.addColorStop(1, glow + '00');
        cx.globalAlpha = r.a * (0.72 + Math.sin(T * 0.32 + r.ph) * 0.28);
        cx.fillStyle = g; cx.beginPath();
        cx.moveTo(x - w * 0.3, -20); cx.lineTo(x + w * 0.7, -20);
        cx.lineTo(x + w * 1.5, H + 20); cx.lineTo(x + w * 0.5, H + 20);
        cx.closePath(); cx.fill();
      });
      cx.restore();

      layers.forEach((L, i) => {
        const p = (i + 1) * 16, sway = reduce ? 0 : Math.sin(T * 0.24 + i) * 3.5 * (i + 1);
        cx.globalAlpha = L.alpha;
        cx.drawImage(L.c, cxo - px * p + sway, H - dh + 30 - py * p * 0.25, dw, dh);
      });

      /* canopy ceiling overhead */
      cx.globalAlpha = 0.72;
      cx.drawImage(canopy, cxo - px * 34, -py * 20 - 30, dw, dh);
      cx.globalAlpha = 1;

      cx.save(); cx.globalCompositeOperation = 'screen';
      dapples.forEach(d => {
        const x = (d.x + Math.sin(T * 0.08 + d.ph) * 0.05) * W, y = d.y * H, r = d.r * H;
        const g = cx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, glow + '26'); g.addColorStop(1, glow + '00');
        cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
      });
      for (let i = 0; i < 4; i++) {
        const y = H * (0.48 + i * 0.14) + Math.sin(T * 0.13 + i * 2) * 16;
        const g = cx.createLinearGradient(0, y - 75, 0, y + 75);
        g.addColorStop(0, leaf + '00'); g.addColorStop(0.5, leaf + '30'); g.addColorStop(1, leaf + '00');
        cx.fillStyle = g;
        cx.fillRect(-40 + Math.sin(T * 0.07 + i) * 55, y - 75, W + 80, 150);
      }
      cx.restore();

      cx.save(); cx.globalAlpha = 0.4; cx.strokeStyle = ink; cx.lineWidth = 2;
      birds.forEach(b => {
        b.t += b.sp * 0.004; if (b.t > 1.35) b.t = -0.35;
        const x = (b.dir > 0 ? b.t : 1 - b.t) * W;
        const y = b.y * H + Math.sin(T * 0.6 + b.t * 8) * 14;
        const f = Math.sin(T * 7 + b.t * 20) * 0.5 + 0.5, s = 7 * b.sc;
        cx.beginPath();
        cx.moveTo(x - s, y + f * s * 0.5);
        cx.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y);
        cx.quadraticCurveTo(x + s * 0.4, y - s * 0.4, x + s, y + f * s * 0.5);
        cx.stroke();
      });
      cx.restore();

      cx.save(); cx.globalCompositeOperation = 'screen'; cx.fillStyle = glow;
      motes.forEach(m => {
        m.y -= m.sp * 0.006;
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        const x = m.x * W + Math.sin(T * 0.5 + m.ph) * 24 - px * 30, y = m.y * H - py * 18;
        cx.globalAlpha = Math.max(0, m.a * (0.55 + Math.sin(T * 1.4 + m.ph) * 0.45));
        cx.beginPath(); cx.arc(x, y, m.r, 0, 6.283); cx.fill();
      });
      cx.restore();

      const lspr = leafFor(leaf);
      cx.save(); cx.globalAlpha = 0.55;
      leaves.forEach(l => {
        l.y += l.sp * 0.0035; l.r += l.vr * 0.006;
        if (l.y > 1.08) { l.y = -0.08; l.x = Math.random(); }
        const x = l.x * W + Math.sin(T * 0.6 + l.ph) * l.sw - px * 26, y = l.y * H, s = 22 * l.sc;
        cx.save(); cx.translate(x, y); cx.rotate(l.r);
        cx.scale(1, Math.cos(T * 1.2 + l.ph) * 0.6 + 0.4);
        cx.drawImage(lspr, -s / 2, -s / 2, s, s);
        cx.restore();
      });
      cx.restore();

      cx.save(); cx.globalCompositeOperation = 'screen';
      flies.forEach(f => {
        f.x += Math.sin(T * 0.3 + f.ph) * 0.00035 * f.drift;
        f.y += Math.cos(T * 0.42 + f.ph) * 0.00022;
        const b = Math.max(0, Math.sin(T * f.blink + f.ph));
        if (b < 0.05) return;
        const x = (((f.x % 1) + 1) % 1) * W - px * 40, y = f.y * H - py * 22;
        cx.globalAlpha = b * 0.28; cx.fillStyle = fire;
        cx.beginPath(); cx.arc(x, y, 7, 0, 6.283); cx.fill();
        cx.globalAlpha = b * 0.95; cx.fillStyle = '#FFFDF2';
        cx.beginPath(); cx.arc(x, y, 1.5, 0, 6.283); cx.fill();
      });
      cx.restore();

      if (frame) {
        cx.globalAlpha = 0.9;
        cx.drawImage(fore, cxo - px * 54, H - dh - py * 28, dw, dh);
        cx.globalAlpha = 1;
      }

      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf.current);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
    };
  }, [intensity, frame]);

  return (
    <>
      <canvas
        ref={ref}
        aria-hidden
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block' }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background:
            'radial-gradient(125% 88% at 50% 42%,transparent 26%,rgba(0,0,0,.5) 74%,rgba(0,0,0,.85) 100%)',
        }}
      />
    </>
  );
}
