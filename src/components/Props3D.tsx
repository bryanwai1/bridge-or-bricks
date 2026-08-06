import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DerivedState } from "../types";
import { slotCenter, HEX_H, MAP_SIZE } from "../data/board";

const MID = MAP_SIZE / 2;

/**
 * The things that sit ON the mat.
 *
 * The earlier Board3D tried to replace the card art with dioramas and never
 * lined up — any drift was glaring, because the model WAS the tile. Props are
 * a kinder problem: a bridge a few pixels off still reads as a bridge lying
 * across a river. So this layer only ever adds objects on top, and the SVG
 * underneath keeps working whether or not the models load.
 *
 * The camera maths is lifted wholesale from Board3D: the board is a CSS plane
 * doing translateY(offset) rotateX(tilt) scale(camScale), and this scene
 * mirrors it group for group so the two stay locked together.
 */

interface Props {
  state: DerivedState;
  view: { x: number; y: number; size: number };
  rotation: number;
  tilt: number;
  camScale: number;
  camOffset: number;
  width: number;
  height: number;
  perspective: number;
}

type PropKind = "wall" | "wood" | "metal";

const MODEL_URL: Record<PropKind, string> = {
  wall: "assets/models/wall.glb",
  wood: "assets/models/bridge-wood.glb",
  metal: "assets/models/bridge-metal.glb",
};

/** Fraction of a hex width each model should span once scaled. */
/**
 * How long each prop is, as a fraction of a hex's flat-to-flat height.
 *
 * A wall sits on the edge between two hexes, and a flat-top hex's side is
 * HEX_W / 2 — about 0.58 of HEX_H, not a whole hex. Sizing it at ~1.0 made it
 * straddle two tiles. Bridges do cross a whole tile, so they stay near 1.
 */
const SPAN: Record<PropKind, number> = {
  wall: 0.62,
  wood: 0.92,
  metal: 0.96,
};

const cache = new Map<PropKind, Promise<THREE.Object3D>>();

function loadProp(kind: PropKind): Promise<THREE.Object3D> {
  let hit = cache.get(kind);
  if (!hit) {
    hit = new Promise((resolve, reject) => {
      new GLTFLoader().load(
        MODEL_URL[kind],
        (gltf) => {
          const root = gltf.scene;
          // normalise: centre on origin, longest axis becomes 1.0 wide
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          const centre = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(centre);
          const longest = Math.max(size.x, size.y, size.z) || 1;

          /* Normalise the INNER node, not the wrapper.
             The wrapper's scale is what layout() sets every frame, so putting
             the 1/longest factor there meant it was overwritten the moment the
             camera moved — models came out at their raw glTF size, which is
             why the wall arrived about twice as wide as a hex. */
          root.position.sub(centre);
          root.scale.setScalar(1 / longest);
          // lift it so the base rests on the mat instead of halfway through
          root.position.set(0, size.y / longest / 2, 0);

          const wrap = new THREE.Group();
          wrap.add(root);
          resolve(wrap);
        },
        undefined,
        reject,
      );
    });
    cache.set(kind, hit);
  }
  return hit;
}

interface Placement {
  kind: PropKind;
  /** board-space centre, before the camera spin */
  x: number;
  y: number;
  /** extra spin in radians, for walls that lie along an edge */
  angle: number;
  /** 0..1 — drives how battered the prop looks */
  health: number;
}

export default function Props3D({
  state,
  view,
  rotation,
  tilt,
  camScale,
  camOffset,
  width,
  height,
  perspective,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    offset: THREE.Group;
    tilt: THREE.Group;
    scale: THREE.Group;
    content: THREE.Group;
    raf: number;
  } | null>(null);

  /* ---- what needs drawing ---- */
  const placements = useMemo<Placement[]>(() => {
    const out: Placement[] = [];

    for (const [slot, list] of Object.entries(state.bridges)) {
      const [col, row] = slot.split(",").map(Number);
      const c = slotCenter({ col, row });
      for (const b of list) {
        const max = b.type === "wood" ? 2 : 4;
        out.push({
          kind: b.type,
          x: c.x,
          y: c.y,
          angle: 0,
          health: Math.max(0, Math.min(1, b.durability / max)),
        });
      }
    }

    for (const [key, w] of Object.entries(state.walls)) {
      const [ka, kb] = key.split("|");
      if (!ka || !kb) continue;
      const [ac, ar] = ka.split(",").map(Number);
      const [bc, br] = kb.split(",").map(Number);
      const a = slotCenter({ col: ac, row: ar });
      const b = slotCenter({ col: bc, row: br });
      out.push({
        kind: "wall",
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        // lie along the shared edge, i.e. across the line joining the centres
        angle: Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2,
        health: Math.max(0, Math.min(1, w.durability / 2)),
      });
    }
    return out;
  }, [state.bridges, state.walls]);

  /* ---- scene, once ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 10, 20000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.35);
    key.position.set(-260, 420, 520);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd98a, 0.45);
    rim.position.set(400, -200, 260);
    scene.add(rim);

    const offset = new THREE.Group();
    const tiltG = new THREE.Group();
    const scaleG = new THREE.Group();
    const content = new THREE.Group();
    scaleG.add(content);
    tiltG.add(scaleG);
    offset.add(tiltG);
    scene.add(offset);

    const ref = { renderer, scene, camera, offset, tilt: tiltG, scale: scaleG, content, raf: 0 };
    three.current = ref;

    const tick = () => {
      ref.raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(ref.raf);
      renderer.dispose();
      three.current = null;
    };
  }, []);

  /* ---- canvas size and the matching camera ---- */
  useEffect(() => {
    const r = three.current;
    if (!r || width < 2 || height < 2) return;
    r.renderer.setSize(width, height, false);
    r.camera.aspect = width / height;
    // fov chosen so world units equal CSS pixels on the z = 0 plane
    r.camera.fov = (2 * Math.atan(height / 2 / perspective) * 180) / Math.PI;
    r.camera.position.set(0, 0, perspective);
    r.camera.lookAt(0, 0, 0);
    r.camera.updateProjectionMatrix();
  }, [width, height, perspective]);

  /* ---- rebuild the props whenever the set changes ---- */
  useEffect(() => {
    const r = three.current;
    if (!r) return;
    let cancelled = false;

    (async () => {
      const kinds = [...new Set(placements.map((p) => p.kind))];
      const models = new Map<PropKind, THREE.Object3D>();
      for (const k of kinds) {
        try {
          models.set(k, await loadProp(k));
        } catch {
          // a missing model is not worth breaking the board over — the SVG
          // wall and bridge markers underneath still show the same state
          console.warn(`[bob] prop model missing: ${k}`);
        }
      }
      if (cancelled || !three.current) return;

      r.content.clear();
      for (const p of placements) {
        const src = models.get(p.kind);
        if (!src) continue;
        const node = src.clone(true);
        node.userData.place = p;
        // battered props sit lower and go grey as durability drains
        // a battered prop settles into the mat; local units, so it survives
        // the per-frame rescale
        const settle = (1 - p.health) * 0.14;
        const inner = node.children[0];
        if (inner) inner.position.y = Math.max(0, inner.position.y - settle);
        node.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          if (p.health < 0.55) {
            mat.color.lerp(new THREE.Color(0x6b6257), (0.55 - p.health) * 1.4);
            mat.roughness = Math.min(1, (mat.roughness ?? 0.6) + 0.3);
          }
          mesh.material = mat;
        });
        r.content.add(node);
      }
      layout();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements]);

  /* ---- reposition on every camera or view change ---- */
  const layout = () => {
    const r = three.current;
    if (!r || width < 2 || height < 2) return;

    r.offset.position.y = -camOffset;
    r.tilt.rotation.x = -(tilt * Math.PI) / 180;
    r.scale.scale.setScalar(camScale);

    const spin = (rotation * Math.PI) / 180;
    const s = Math.min(width / view.size, height / view.size);
    const padX = (width - view.size * s) / 2;
    const padY = (height - view.size * s) / 2;
    const hexPx = HEX_H * s;

    for (const node of r.content.children) {
      const p = node.userData.place as Placement | undefined;
      if (!p) continue;

      let cx = p.x;
      let cy = p.y;
      if (spin) {
        const dx = cx - MID;
        const dy = cy - MID;
        cx = MID + dx * Math.cos(spin) - dy * Math.sin(spin);
        cy = MID + dx * Math.sin(spin) + dy * Math.cos(spin);
      }
      const lx = padX + (cx - view.x) * s - width / 2;
      const ly = padY + (cy - view.y) * s - height / 2;

      const span = hexPx * SPAN[p.kind];
      node.scale.setScalar(span);
      // stand the model up out of the texture plane, then spin it to match
      node.rotation.set(Math.PI / 2, 0, -(spin + p.angle));
      node.position.set(lx, -ly, 0);
    }
  };

  useEffect(layout, [
    view.x,
    view.y,
    view.size,
    rotation,
    tilt,
    camScale,
    camOffset,
    width,
    height,
    placements,
  ]);

  return <canvas ref={canvasRef} className="props-3d" aria-hidden />;
}
