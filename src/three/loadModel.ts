import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  name: string;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<ModelPart[] | null>>();

/** Materials shared by name across every card, so the whole board is one program set. */
const shared = new Map<string, THREE.MeshStandardMaterial>();

function materialFor(src: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const name = src.name || "default";
  const hit = shared.get(name);
  if (hit) return hit;

  const m = new THREE.MeshStandardMaterial({
    color: src.color.clone(),
    roughness: src.roughness ?? 1,
    metalness: src.metalness ?? 0,
    flatShading: true, // the models ship without normals, and faceted is the look
    name,
  });

  // a few materials earn special treatment
  if (name === "fire") {
    m.emissive = new THREE.Color(0xff7a18);
    m.emissiveIntensity = 1.5;
    m.roughness = 0.6;
  } else if (name === "smoke") {
    m.transparent = true;
    m.opacity = 0.4;
    m.depthWrite = false;
  } else if (name === "water") {
    m.roughness = 0.18;
    m.metalness = 0.25;
  } else if (name.startsWith("foliage") || name === "grass") {
    m.roughness = 0.95;
  }

  shared.set(name, m);
  return m;
}

/**
 * Loads a card's diorama and collapses it to one geometry per material.
 * The exports arrive as ~110 separate meshes; left alone that is ~110 draw
 * calls per tile, which no phone will survive across a full board.
 */
export function loadModel(cardId: string): Promise<ModelPart[] | null> {
  const hit = cache.get(cardId);
  if (hit) return hit;

  const p = new Promise<ModelPart[] | null>((resolve) => {
    loader.load(
      `assets/models/${cardId}.glb`,
      (gltf) => {
        const byMaterial = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.MeshStandardMaterial }>();

        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          const key = srcMat.name || "default";

          // keep position only: no textures on these models, so nothing else is used
          const src = mesh.geometry.clone();
          src.applyMatrix4(mesh.matrixWorld);
          const g = new THREE.BufferGeometry();
          const pos = src.getAttribute("position");
          if (!pos) return;
          g.setAttribute("position", pos);
          if (src.index) g.setIndex(src.index);

          const bucket = byMaterial.get(key);
          if (bucket) bucket.geos.push(g);
          else byMaterial.set(key, { geos: [g], mat: materialFor(srcMat) });
        });

        const parts: ModelPart[] = [];
        for (const [name, { geos, mat }] of byMaterial) {
          const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
          if (!merged) continue;
          merged.computeVertexNormals();
          merged.computeBoundingSphere();
          parts.push({ geometry: merged, material: mat, name });
        }
        resolve(parts.length ? parts : null);
      },
      undefined,
      () => resolve(null), // no model for this card yet — the flat art stays
    );
  });

  cache.set(cardId, p);
  return p;
}

export function hasModelCached(cardId: string): boolean {
  return cache.has(cardId);
}
