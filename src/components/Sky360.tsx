import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  /** Equirectangular 2:1 panorama, relative to /public. */
  src: string;
  rotation: number;
  tilt: number;
  width: number;
  height: number;
  perspective: number;
}

const SKY_RADIUS = 9000;

/**
 * The world the table sits in.
 *
 * A sphere turned inside out, with the panorama mapped to it, sharing the
 * board's camera maths exactly. It lives on its own canvas *behind* the mat, so
 * the horizon shows around the board's edges without covering the tiles.
 *
 * Orientation: the sphere's zenith is aimed along the board's normal, so at
 * pitch 0 you are looking straight down at open water, and as the camera drops
 * the horizon rises into frame around the board.
 */
export default function Sky360({ src, rotation, tilt, width, height, perspective }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ref = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pitch: THREE.Group;
    yaw: THREE.Group;
    raf: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); // a backdrop; it can be softer
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 10, SKY_RADIUS * 2.2);

    const pitch = new THREE.Group();
    const yaw = new THREE.Group();
    pitch.add(yaw);
    scene.add(pitch);

    const geo = new THREE.SphereGeometry(SKY_RADIUS, 60, 40);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x8899aa });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.rotation.x = Math.PI / 2; // zenith along the board normal
    yaw.add(sphere);

    new THREE.TextureLoader().load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });

    const state = { renderer, scene, camera, pitch, yaw, raf: 0 };
    ref.current = state;

    const tick = () => {
      state.raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(state.raf);
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
      renderer.dispose();
      ref.current = null;
    };
  }, [src]);

  useEffect(() => {
    const r = ref.current;
    if (!r || width < 2 || height < 2) return;
    r.renderer.setSize(width, height, false);
    r.camera.aspect = width / height;
    r.camera.fov = (2 * Math.atan(height / 2 / perspective) * 180) / Math.PI;
    r.camera.position.set(0, 0, perspective);
    r.camera.lookAt(0, 0, 0);
    r.camera.updateProjectionMatrix();
  }, [width, height, perspective]);

  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    r.pitch.rotation.x = -(tilt * Math.PI) / 180;
    r.yaw.rotation.z = -(rotation * Math.PI) / 180;
  }, [rotation, tilt]);

  return <canvas ref={canvasRef} className="board-sky" />;
}
