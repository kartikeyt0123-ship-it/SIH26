"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { damp } from "@/lib/utils";
import { storyRef } from "@/lib/story";
import { hash, roundedSlabGeometry, smoothstep } from "./geometry";
import {
  paintTexture,
  stoneTexture,
  tileTexture,
  timberTexture,
  wallpaperTexture,
} from "./textures";

/* ------------------------------------------------------------------
   ONE room, six states.

   The scene is a real interior — two walls, a floor, a window, a
   feature panel, furniture — because the thing being sold is a whole
   surface scheme, not a product. It is never torn down between beats:
   a hard cut would break the argument, which is that these are six
   stages of ONE decision.

   Beat 1  bare shell
   Beat 2  the space is read
   Beat 3  every surface is clad
   Beat 4  the whole scheme swaps
   Beat 5  unavailable finishes go dark
   Beat 6  what survives becomes a quotation
   ------------------------------------------------------------------ */

type SurfaceDef = {
  key: string;
  size: [number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  bare: string;
  a: () => THREE.Texture;
  b: () => THREE.Texture;
  repeat: [number, number];
  roughA: number;
  roughB: number;
};

const SURFACES: SurfaceDef[] = [
  {
    key: "back-wall",
    size: [7.2, 3.4],
    position: [0, 0, -2.0],
    rotation: [0, 0, 0],
    bare: "#b3aa9b",
    a: () => paintTexture("#d9c4a0"),
    b: () => wallpaperTexture("#2f4f4a", "#c79a45"),
    repeat: [3, 1.5],
    roughA: 0.92,
    roughB: 0.78,
  },
  {
    key: "left-wall",
    size: [4.4, 3.4],
    position: [-3.55, 0, 0.2],
    rotation: [0, Math.PI / 2, 0],
    bare: "#a9a091",
    a: () => wallpaperTexture("#e7dbc4", "#a9543c"),
    b: () => paintTexture("#3f5a54"),
    repeat: [2, 1.5],
    roughA: 0.8,
    roughB: 0.94,
  },
  {
    key: "floor",
    size: [7.2, 4.4],
    position: [0, -1.68, 0.2],
    rotation: [-Math.PI / 2, 0, 0],
    bare: "#8f887c",
    a: () => tileTexture("#cfc7b8"),
    b: () => timberTexture("#a97c4c", "#5e4227"),
    repeat: [3, 2],
    roughA: 0.28,
    roughB: 0.55,
  },
  {
    key: "feature-panel",
    size: [2.3, 2.6],
    position: [1.95, -0.28, -1.95],
    rotation: [0, 0, 0],
    bare: "#bdb4a4",
    a: () => stoneTexture("#8d8478"),
    b: () => tileTexture("#a9543c", "#5e3327", 3),
    repeat: [1, 1],
    roughA: 0.62,
    roughB: 0.3,
  },
];

/** Shade chips: a dealer's whole book, across categories, not one colour family. */
const SHADES = [
  "#efe7d8", "#e7dbc4", "#dcc9a6", "#c9a97b", "#b98a57", "#9c6a45",
  "#8d5138", "#a9543c", "#c96f4a", "#e2542a", "#d98f6a", "#efc9a8",
  "#cfd3c4", "#b3bda9", "#8f9c86", "#6f8071", "#4f6a63", "#1a736a",
  "#7f8fa6", "#5e7391", "#3b4f9e", "#2b3550", "#4a4a52", "#6d6a63",
].map((h) => new THREE.Color(h));

const C = {
  dead: new THREE.Color("#161a1f"),
  paper: new THREE.Color("#efeae0"),
  pigment: new THREE.Color("#e2542a"),
};

/** Camera keyframes, one per beat. Interpolated, never cut. */
const CAM: [number, number, number][] = [
  [0.4, 0.35, 7.4],   // 01 wide, cold, empty
  [-1.5, 0.1, 4.6],   // 02 pushed in, reading the surface
  [1.9, 0.55, 4.9],   // 03 the corner, both walls and floor in frame
  [-0.6, 1.35, 4.3],  // 04 higher, taking in the whole scheme
  [0.2, 0.2, 4.0],    // 05 close on the swatches
  [0.0, 0.05, 6.6],   // 06 back out, the document
];

function keyframe(p: number, frames: [number, number, number][], out: THREE.Vector3) {
  const t = p * (frames.length - 1);
  const i = Math.min(frames.length - 2, Math.floor(t));
  const f = smoothstep(0, 1, t - i);
  const a = frames[i];
  const b = frames[i + 1];
  return out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

function repeated(tex: THREE.Texture, r: [number, number]) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(r[0], r[1]);
  return t;
}

/* ------------------------------------------------------------------ */

export function Composition({ lowPower = false }: { lowPower?: boolean }) {
  const COLS = lowPower ? 6 : 8;
  const ROWS = lowPower ? 4 : 5;
  const COUNT = COLS * ROWS;
  const DOC_LINES = 11;

  const { camera } = useThree();

  const chipGeo = useMemo(
    () => roundedSlabGeometry(0.42, 0.42, 0.09, 0.07, lowPower ? 1 : 3),
    [lowPower],
  );

  /** Three materials per surface: bare shell, scheme A, scheme B. */
  const surfaceMats = useMemo(
    () =>
      SURFACES.map((s) => ({
        bare: new THREE.MeshStandardMaterial({ color: s.bare, roughness: 0.95, metalness: 0 }),
        a: new THREE.MeshStandardMaterial({
          map: repeated(s.a(), s.repeat),
          roughness: s.roughA,
          metalness: 0.02,
          transparent: true,
          opacity: 0,
        }),
        b: new THREE.MeshStandardMaterial({
          map: repeated(s.b(), s.repeat),
          roughness: s.roughB,
          metalness: 0.02,
          transparent: true,
          opacity: 0,
        }),
      })),
    [],
  );

  useLayoutEffect(
    () => () => {
      chipGeo.dispose();
      surfaceMats.forEach((m) => {
        m.bare.dispose();
        m.a.map?.dispose();
        m.a.dispose();
        m.b.map?.dispose();
        m.b.dispose();
      });
    },
    [chipGeo, surfaceMats],
  );

  const room = useRef<THREE.Group>(null!);
  const props = useRef<THREE.Group>(null!);
  const chips = useRef<THREE.InstancedMesh>(null!);
  const scan = useRef<THREE.Mesh>(null!);
  const glow = useRef<THREE.PointLight>(null!);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(0, -0.15, -0.6), []);

  const chipData = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const r = hash(i * 3.17);
        return {
          x: (col - (COLS - 1) / 2) * 0.56,
          y: ((ROWS - 1) / 2 - row) * 0.56 - 0.1,
          shade: SHADES[i % SHADES.length],
          // ASSUMPTION: 58% availability is illustrative for the scene only.
          // Real availability is computed per material from live dealer stock.
          available: r > 0.42,
          order: hash(i * 7.77),
          match: i === Math.floor(COUNT * 0.42),
        };
      }),
    [COLS, ROWS, COUNT],
  );

  const smoothed = useRef(0);

  useFrame((_state, dt) => {
    const d = Math.min(dt, 1 / 30);
    smoothed.current = damp(smoothed.current, storyRef.progress, 6, d);
    const p = smoothed.current;

    /* ---- camera ---- */
    keyframe(p, CAM, camTarget);
    camera.position.set(
      damp(camera.position.x, camTarget.x + storyRef.pointer.x * 0.32, 5, d),
      damp(camera.position.y, camTarget.y + storyRef.pointer.y * 0.2, 5, d),
      damp(camera.position.z, camTarget.z, 5, d),
    );
    camera.lookAt(lookAt);

    /* ---- 02: the space is read ---- */
    const scanIn = smoothstep(0.15, 0.2, p) * (1 - smoothstep(0.29, 0.34, p));
    if (scan.current) {
      scan.current.visible = scanIn > 0.01;
      scan.current.position.y = 2.0 - smoothstep(0.15, 0.33, p) * 3.9;
      (scan.current.material as THREE.MeshBasicMaterial).opacity = scanIn * 0.7;
    }

    /* ---- 03 / 04: the surfaces are clad, then the scheme swaps ---- */
    const cladA = smoothstep(0.34, 0.48, p);
    const cladB = smoothstep(0.53, 0.66, p);
    surfaceMats.forEach((m, i) => {
      // Surfaces resolve in sequence — floor, then walls, then the feature
      // panel — so the eye can follow a room being dressed rather than a
      // single crossfade of everything at once.
      const lead = i * 0.06;
      m.a.opacity = Math.max(0, Math.min(1, (cladA - lead) / (1 - lead)));
      m.b.opacity = Math.max(0, Math.min(1, (cladB - lead) / (1 - lead)));
    });

    /* ---- 05 / 06: the room recedes, the swatches take over ---- */
    const recede = smoothstep(0.66, 0.78, p);
    if (room.current) {
      room.current.position.z = -recede * 2.4;
      room.current.rotation.y = -0.06 + Math.sin(p * Math.PI) * 0.16 + storyRef.pointer.x * 0.03;
    }
    if (props.current) {
      props.current.visible = recede < 0.98;
      props.current.position.y = -recede * 0.6;
    }
    if (glow.current) glow.current.intensity = 3.2 * (1 - recede * 0.7);

    const appear = smoothstep(0.66, 0.78, p);
    const availability = smoothstep(0.8, 0.88, p);
    const quote = smoothstep(0.9, 0.99, p);

    const mesh = chips.current;
    if (!mesh) return;

    for (let i = 0; i < COUNT; i++) {
      const c = chipData[i];
      const local = Math.min(1, Math.max(0, (appear - c.order * 0.3) / 0.7));
      const enter = local * local * (3 - 2 * local);

      let x = c.x;
      let y = c.y;
      let z = 1.9 + Math.sin(c.x * 1.4 + c.y) * 0.06;
      let sx = 1;
      let sy = 1;
      let s = enter;

      if (!c.available) {
        z -= availability * 0.5;
        s *= 1 - availability * 0.3;
      } else {
        z += availability * 0.14;
      }

      if (c.match) {
        const focus = smoothstep(0.82, 0.89, p) * (1 - quote);
        z += focus * 0.45;
        s *= 1 + focus * 0.5;
      }

      if (quote > 0.001) {
        const line = i % DOC_LINES;
        const lane = Math.floor(i / DOC_LINES);
        const targetX = hash(i * 1.3) * 0.5;
        const targetY = 1.4 - line * 0.26;
        const widthFactor = 3.0 + hash(i * 2.9) * 2.6;
        if (lane === 0) {
          x += (targetX - x) * quote;
          y += (targetY - y) * quote;
          sx = 1 + (widthFactor - 1) * quote;
          sy = 1 - 0.62 * quote;
        } else {
          s *= 1 - quote;
        }
      }

      dummy.position.set(x, y, z);
      dummy.scale.set(Math.max(0.0001, s * sx), Math.max(0.0001, s * sy), Math.max(0.0001, s));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      tmpColor.copy(c.shade);
      if (!c.available) tmpColor.lerp(C.dead, availability * 0.9);
      if (quote > 0.001) tmpColor.lerp(c.match ? C.pigment : C.paper, quote * 0.9);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <group ref={room}>
        {/* Each surface is three coplanar planes, offset by 6mm so the
            crossfade between schemes cannot z-fight. */}
        {SURFACES.map((s, i) => (
          <group key={s.key} position={s.position} rotation={s.rotation}>
            <mesh material={surfaceMats[i].bare}>
              <planeGeometry args={s.size} />
            </mesh>
            <mesh position={[0, 0, 0.006]} material={surfaceMats[i].a}>
              <planeGeometry args={s.size} />
            </mesh>
            <mesh position={[0, 0, 0.012]} material={surfaceMats[i].b}>
              <planeGeometry args={s.size} />
            </mesh>
          </group>
        ))}

        <group ref={props}>
          {/* window — the only light source the room admits, and the reason
              the customer's photo never matches the shade card */}
          <mesh position={[-1.55, 0.35, -1.97]}>
            <planeGeometry args={[1.9, 1.7]} />
            <meshBasicMaterial color="#f3ead9" toneMapped={false} />
          </mesh>
          <mesh position={[-1.55, 0.35, -1.94]}>
            <planeGeometry args={[0.05, 1.7]} />
            <meshBasicMaterial color="#2a2a2c" />
          </mesh>
          <mesh position={[-1.55, 0.35, -1.94]}>
            <planeGeometry args={[1.9, 0.05]} />
            <meshBasicMaterial color="#2a2a2c" />
          </mesh>

          {/* skirting */}
          <mesh position={[0, -1.58, -1.93]}>
            <boxGeometry args={[7.2, 0.18, 0.06]} />
            <meshStandardMaterial color="#efeae0" roughness={0.5} />
          </mesh>

          {/* a low seat and a rug: scale cues, so the walls read as walls */}
          <mesh position={[-1.2, -1.26, -0.55]}>
            <boxGeometry args={[2.3, 0.72, 0.9]} />
            <meshStandardMaterial color="#6f6558" roughness={0.9} />
          </mesh>
          <mesh position={[-1.2, -0.78, -0.9]}>
            <boxGeometry args={[2.3, 0.5, 0.24]} />
            <meshStandardMaterial color="#7d7264" roughness={0.9} />
          </mesh>
          <mesh position={[0.5, -1.6, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.2, 2.0]} />
            <meshStandardMaterial color="#54463c" roughness={1} />
          </mesh>
        </group>

        {/* the reading sweep */}
        <mesh ref={scan} position={[0, 0, -1.2]} visible={false}>
          <planeGeometry args={[7.6, 0.03]} />
          <meshBasicMaterial color="#f0805a" transparent opacity={0} toneMapped={false} />
        </mesh>
      </group>

      {/* the dealer's book, then availability, then the quotation */}
      <instancedMesh ref={chips} args={[chipGeo, undefined, COUNT]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.06} />
      </instancedMesh>

      <ambientLight intensity={0.42} />
      <pointLight ref={glow} position={[-1.55, 0.35, -1.4]} intensity={3.2} color="#ffe9cc" distance={9} />
      <directionalLight position={[3.5, 4.5, 4]} intensity={1.5} color="#fff6ec" />
      <directionalLight position={[-4, 1, 3]} intensity={0.5} color="#7f9dc4" />

      {/* No HDR fetch — the environment is emissive planes, so the scene
          renders identically offline and costs nothing over the wire. */}
      {!lowPower && (
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 3, 3]} scale={[7, 3, 1]} color="#fff1e2" />
          <Lightformer intensity={0.8} position={[-4, 0, 2]} scale={[3, 6, 1]} color="#8fb4d6" />
          <Lightformer intensity={0.6} position={[4, -1, 2]} scale={[3, 6, 1]} color="#e8b98f" />
        </Environment>
      )}
    </>
  );
}
