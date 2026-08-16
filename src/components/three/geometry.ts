import * as THREE from "three";

/**
 * A bevelled rounded slab, built from an extruded shape.
 *
 * Written by hand rather than pulled from a helper library because every chip
 * and every layer in the scene shares exactly one geometry instance — a single
 * upload, reused by an InstancedMesh. Rounded corners matter here: a hard-edged
 * box reads as a UI card, a bevelled one catches a specular line along the edge
 * and reads as a physical material sample, which is the whole point.
 */
export function roundedSlabGeometry(
  width: number,
  height: number,
  radius: number,
  depth: number,
  segments = 3,
) {
  const w = width / 2 - radius;
  const h = height / 2 - radius;

  const shape = new THREE.Shape();
  shape.moveTo(-w - radius, -h);
  shape.lineTo(-w - radius, h);
  shape.quadraticCurveTo(-w - radius, h + radius, -w, h + radius);
  shape.lineTo(w, h + radius);
  shape.quadraticCurveTo(w + radius, h + radius, w + radius, h);
  shape.lineTo(w + radius, -h);
  shape.quadraticCurveTo(w + radius, -h - radius, w, -h - radius);
  shape.lineTo(-w, -h - radius);
  shape.quadraticCurveTo(-w - radius, -h - radius, -w - radius, -h);

  const bevel = Math.min(depth * 0.28, radius * 0.5);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: segments + 2,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/** Deterministic 0..1 noise. Seeded so the "layout" never shuffles on remount. */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
