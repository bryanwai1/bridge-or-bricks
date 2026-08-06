import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DerivedState } from "../types";
import { MAP_SIZE, slotCenter, HEX_H } from "../data/board";
import { loadModel, type ModelPart } from "../three/loadModel";

const MID = MAP_SIZE / 2;

interface Props {
  state: DerivedState;
  view: { x: number; y: number; size: number };
  rotation: number;
  tilt: number;
  camScale: number;
  camOffset: number;
  width: number;
  height: number;
  /** Matches the CSS `perspective` on .board-3d. */
  perspective: number;
}

interface Placed {
  slot: string;
  cardId: string;
}

/**
 * A WebGL layer sitting exactly on top of the SVG mat.
 *
 * The board is a CSS-transformed plane: translateY(offset) rotateX(tilt)
 * scale(k) inside a parent with `perspective: d`. That is reproducible one
 * for one in Three by putting the camera at z = d with a field of view derived
 * from the canvas height, so one world unit equals one CSS pixel at z = 0.
 * Everything then lines up through pan, zoom, spin and pitch without a single
 * fudge factor.
 */
export default function Board3D({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    offset: THREE.Group;
    tilt: THREE.Group;
    scale: THREE.Group;
    content: THREE.Group;
    fire: THREE.MeshStandardMaterial[];
    raf: number;
  } | null>(null);
  /** cardId -> the instanced meshes drawing it, plus which slots they cover */
  const built = useRef(new Map<string, { meshes: THREE.InstancedMesh[]; slots: string[] }>());

  /* ---- one-time setup ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 10, 20000);

    // a warm key light plus cool bounce — the board turns under fixed lighting,
    // the way a mat turns under a lamp
    const key = new THREE.DirectionalLight(0xfff1d6, 2.1);
    key.position.set(-420, 900, 760);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc6ff, 0.55);
    rim.position.set(600, 320, -500);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffe9c4, 0x241c12, 0.85));

    const offset = new THREE.Group();
    const tiltG = new THREE.Group();
    const scaleG = new THREE.Group();
    const content = new THREE.Group();
    scaleG.add(content);
    tiltG.add(scaleG);
    offset.add(tiltG);
    scene.add(offset);

    const ref = { renderer, scene, camera, offset, tilt: tiltG, scale: scaleG, content, fire: [] as THREE.MeshStandardMaterial[], raf: 0 };
    three.current = ref;

    const tick = () => {
      ref.raf = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      for (const m of ref.fire) {
        m.emissiveIntensity = 1.25 + Math.sin(t * 7.3) * 0.3 + Math.sin(t * 17.1) * 0.15;
      }
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

  /* ---- build instanced meshes when the set of modelled tiles changes ---- */
  useEffect(() => {
    const r = three.current;
    if (!r) return;

    const placed: Placed[] = [];
    for (const [slot, t] of Object.entries(state.tiles)) {
      if (t.faceDown) continue; // still a deck back on the mat
      placed.push({ slot, cardId: t.cardId.startsWith("BASE") ? "BASE" : t.cardId });
    }

    const byCard = new Map<string, string[]>();
    for (const p of placed) {
      const list = byCard.get(p.cardId);
      if (list) list.push(p.slot);
      else byCard.set(p.cardId, [p.slot]);
    }

    let cancelled = false;

    // drop cards that left the board
    for (const [cardId, entry] of [...built.current]) {
      if (!byCard.has(cardId)) {
        entry.meshes.forEach((m) => {
          r.content.remove(m);
          m.dispose();
        });
        built.current.delete(cardId);
      }
    }

    const attach = (cardId: string, slots: string[], parts: ModelPart[]) => {
      if (cancelled) return;
      const prev = built.current.get(cardId);
      if (prev) {
        prev.meshes.forEach((m) => {
          r.content.remove(m);
          m.dispose();
        });
      }
      const meshes = parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, slots.length);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        r.content.add(im);
        if (p.name === "fire" && !r.fire.includes(p.material)) r.fire.push(p.material);
        return im;
      });
      built.current.set(cardId, { meshes, slots });
      layout();
    };

    for (const [cardId, slots] of byCard) {
      const prev = built.current.get(cardId);
      if (prev && prev.slots.length === slots.length && prev.slots.every((s, i) => s === slots[i])) continue;
      void loadModel(cardId).then((parts) => {
        if (parts) attach(cardId, slots, parts);
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    Object.entries(state.tiles)
      .filter(([, t]) => !t.faceDown)
      .map(([k, t]) => `${k}:${t.cardId}`)
      .sort()
      .join("|"),
  ]);

  /* ---- reposition every instance whenever the camera or view moves ---- */
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
    const hexPx = HEX_H * s; // the model is 1.0 across the flats

    const m = new THREE.Matrix4();
    const rz = new THREE.Matrix4().makeRotationZ(-spin);
    const rx = new THREE.Matrix4().makeRotationX(Math.PI / 2); // stand the model up
    const sc = new THREE.Matrix4().makeScale(hexPx, hexPx, hexPx);
    const base = new THREE.Matrix4().multiplyMatrices(rz, rx).multiply(sc);

    for (const { meshes, slots } of built.current.values()) {
      slots.forEach((slot, i) => {
        const [col, row] = slot.split(",").map(Number);
        let { x: cx, y: cy } = slotCenter({ col, row });
        if (spin) {
          const dx = cx - MID;
          const dy = cy - MID;
          cx = MID + dx * Math.cos(spin) - dy * Math.sin(spin);
          cy = MID + dx * Math.sin(spin) + dy * Math.cos(spin);
        }
        const lx = padX + (cx - view.x) * s - width / 2;
        const ly = padY + (cy - view.y) * s - height / 2;
        m.copy(base);
        m.setPosition(lx, -ly, 0); // screen Y is down, world Y is up
        meshes.forEach((im) => im.setMatrixAt(i, m));
      });
      meshes.forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      });
    }
  };

  useEffect(layout, [view.x, view.y, view.size, rotation, tilt, camScale, camOffset, width, height]);

  return <canvas ref={canvasRef} className="board-gl" />;
}
