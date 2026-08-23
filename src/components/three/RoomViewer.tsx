"use client";

import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, SoftShadows } from "@react-three/drei";
import type { RoomModel } from "@/lib/vision";
import { timberTexture } from "./textures";

/**
 * The customer's own room, rebuilt as a space they can repaint and walk around.
 *
 * Proportions, the floor line, the window side and the light temperature all
 * come from `analyzeRoomPhotos`. It is a reconstruction, not a measurement —
 * the UI says so, and nothing in the quotation is derived from it.
 *
 * WHY IT IS FURNISHED. The previous version was six tinted planes, and colour
 * in an empty box reads nothing like colour in a room: there is no shadow to
 * darken it, no floor bouncing warmth back up, nothing at human scale to judge
 * it against. Customers were choosing shades against a lightbox. So there is
 * now a real floor, real skirting, a recessed window that actually throws
 * light, and enough furniture to cast shadows and give the eye a size
 * reference.
 *
 * WHAT IS STILL DELIBERATELY HONEST. The walls carry no invented texture. A
 * plaster or roller pattern we made up is a pattern their wall does not have,
 * and it would change the perceived colour. Walls stay flat and matte; the
 * realism comes from light and shadow, which are properties of the room rather
 * than claims about the paint.
 */

export type SchemeColors = {
  main: string;
  feature: string;
  ceiling: string;
  trim: string;
};

export function RoomViewer({
  room,
  colors,
  roomType,
  className,
}: {
  room: RoomModel;
  colors: SchemeColors;
  /** Drives which furniture appears. Falls back to a living room. */
  roomType?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        // Capped DPR and a modest shadow budget: this runs on a counter phone,
        // and a beautiful scene at twelve frames is worse than a good one at
        // sixty.
        dpr={[1, 1.6]}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        // A corner view, from the doorway, standing back.
        //
        // Pointing straight at the back wall filled the frame with the FEATURE
        // colour — so a customer who had chosen a white main wall and one deep
        // accent saw an entirely deep-coloured room and judged the scheme on a
        // surface that covers a fraction of it. Off-axis shows both a main wall
        // and the feature wall in their real proportions, which is the only way
        // the balance can be judged.
        camera={{
          fov: 54,
          position: [room.widthM * 0.3, 0.5, room.depthM * 0.72],
          near: 0.05,
          far: 60,
        }}
      >
        <Suspense fallback={null}>
          <SoftShadows size={26} samples={8} focus={0.7} />
          <RoomGeometry room={room} colors={colors} roomType={roomType} />
          <OrbitControls
            enablePan={false}
            minDistance={room.depthM * 0.32}
            // Far enough back to take the whole room in, without leaving it.
            maxDistance={room.depthM * 0.95}
            minPolarAngle={Math.PI * 0.26}
            maxPolarAngle={Math.PI * 0.6}
            target={[0, -0.1, -room.depthM * 0.18]}
            enableDamping
            dampingFactor={0.08}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

/** Slightly darker relative of a colour, for skirting shadow lines and seams. */
function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return `#${c.getHexString()}`;
}

function RoomGeometry({
  room,
  colors,
  roomType,
}: {
  room: RoomModel;
  colors: SchemeColors;
  roomType?: string;
}) {
  const W = room.widthM;
  const H = room.heightM;
  const D = room.depthM;
  const floorY = -H / 2;

  // Warm rooms get a warmer key light. This is the single biggest reason a
  // shade card never matches the wall, so the viewer at least admits it exists.
  const lightColor = useMemo(() => {
    const warm = new THREE.Color("#ffdcb0");
    const cool = new THREE.Color("#cfe0ff");
    return cool.clone().lerp(warm, (room.lightWarmth + 1) / 2);
  }, [room.lightWarmth]);

  // Real timber, generated to a canvas rather than shipped as an image.
  const floorTex = useMemo(() => {
    const tex = timberTexture("#a9835a", "#6f5136").clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(2, W / 1.1), Math.max(2, D / 1.1));
    tex.needsUpdate = true;
    return tex;
  }, [W, D]);

  const side = room.windowSide;
  const hasSideWindow = side === "left" || side === "right";
  const winW = Math.min(1.7, (hasSideWindow ? D : W) * 0.46);
  const winH = Math.min(1.45, H * 0.5);
  const winY = floorY + Math.min(1.05, H * 0.34) + winH / 2;

  const winPos: [number, number, number] = hasSideWindow
    ? [side === "left" ? -W / 2 + 0.06 : W / 2 - 0.06, winY, -D * 0.08]
    : [W * 0.16, winY, -D / 2 + 0.06];
  const winRot: [number, number, number] = [
    0,
    hasSideWindow ? (side === "left" ? Math.PI / 2 : -Math.PI / 2) : 0,
    0,
  ];

  const wallMat = (color: string) => (
    <meshStandardMaterial color={color} roughness={0.96} metalness={0} />
  );

  const key = (roomType ?? "living room").toLowerCase();
  const isBed = key.includes("bed");
  const isKitchen = key.includes("kitchen");
  const isOffice = key.includes("office") || key.includes("shop");

  return (
    <group>
      {/* ------------------------------ shell ------------------------------ */}
      <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={floorTex} roughness={0.62} metalness={0.02} />
      </mesh>

      <mesh position={[0, H / 2, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        {wallMat(colors.ceiling)}
      </mesh>

      {/* back wall — the feature surface */}
      <mesh position={[0, 0, -D / 2]} receiveShadow>
        <planeGeometry args={[W, H]} />
        {wallMat(colors.feature)}
      </mesh>

      <mesh position={[-W / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        {wallMat(colors.main)}
      </mesh>
      <mesh position={[W / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        {wallMat(colors.main)}
      </mesh>
      {/* behind the camera, so bounce light stays honest */}
      <mesh position={[0, 0, D / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[W, H]} />
        {wallMat(colors.main)}
      </mesh>

      {/* --------------------------- skirting, all round -------------------- */}
      {/* Runs the whole perimeter rather than one wall. A skirting board that
          stops at a corner is the detail that makes a render look like a box. */}
      <Skirting W={W} D={D} y={floorY} color={colors.trim} />

      {/* ------------------------------ window ------------------------------ */}
      {side !== "none" && (
        <group position={winPos} rotation={winRot}>
          {/* recess: the reveal is what makes an opening read as cut into a
              wall rather than painted onto it */}
          <mesh position={[0, 0, -0.06]}>
            <planeGeometry args={[winW, winH]} />
            <meshBasicMaterial color="#fdf6e8" toneMapped={false} />
          </mesh>
          <mesh position={[0, winH / 2 + 0.03, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[winW, 0.06]} />
            <meshStandardMaterial color={shade(colors.main, 0.18)} roughness={0.9} />
          </mesh>

          <Frame w={winW} h={winH} thickness={0.07} depth={0.03} color={colors.trim} />
          {/* mullions */}
          <mesh position={[0, 0, 0.016]} castShadow>
            <boxGeometry args={[0.035, winH, 0.028]} />
            <meshStandardMaterial color={colors.trim} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.016]} castShadow>
            <boxGeometry args={[winW, 0.035, 0.028]} />
            <meshStandardMaterial color={colors.trim} roughness={0.35} />
          </mesh>
          {/* sill */}
          <mesh position={[0, -winH / 2 - 0.05, 0.06]} castShadow receiveShadow>
            <boxGeometry args={[winW + 0.18, 0.05, 0.16]} />
            <meshStandardMaterial color={colors.trim} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* ------------------------------- door ------------------------------- */}
      <group position={[-W / 2 + 0.05, floorY + 1.02, D * 0.24]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.86, 2.04, 0.05]} />
          <meshStandardMaterial color={colors.trim} roughness={0.42} />
        </mesh>
        <Frame w={0.98} h={2.14} thickness={0.07} depth={0.05} color={shade(colors.trim, 0.12)} />
        {/* handle — small, but it is what gives the door its size */}
        <mesh position={[0.32, -0.04, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.1, 10]} />
          <meshStandardMaterial color="#b6a68c" roughness={0.28} metalness={0.65} />
        </mesh>
      </group>

      {/* ----------------------------- furniture ---------------------------- */}
      {isBed ? (
        <Bed W={W} D={D} y={floorY} accent={colors.feature} trim={colors.trim} />
      ) : isKitchen ? (
        <Counter W={W} D={D} y={floorY} trim={colors.trim} />
      ) : isOffice ? (
        <Desk W={W} D={D} y={floorY} trim={colors.trim} />
      ) : (
        <Lounge W={W} D={D} y={floorY} accent={colors.feature} trim={colors.trim} />
      )}

      {/* framed picture on the feature wall, for scale and a little life */}
      <group position={[W * 0.24, 0.18, -D / 2 + 0.03]}>
        <mesh castShadow>
          <boxGeometry args={[0.52, 0.68, 0.03]} />
          <meshStandardMaterial color={shade(colors.trim, 0.25)} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[0.44, 0.6]} />
          <meshStandardMaterial color={shade(colors.main, 0.08)} roughness={0.85} />
        </mesh>
      </group>

      {/* pendant, hanging from the ceiling */}
      <group position={[0, H / 2 - 0.36, -D * 0.1]}>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.48, 6]} />
          <meshStandardMaterial color="#2e2a26" roughness={0.6} />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.19, 0.2, 18, 1, true]} />
          <meshStandardMaterial color={colors.trim} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.07, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color="#fff2d8" toneMapped={false} />
        </mesh>
      </group>

      {/* ------------------------------ lighting ---------------------------- */}
      {/* Ambient stays low. A bright flat ambient washes out exactly the
          shadow gradients that let someone judge a colour on a real wall. */}
      <ambientLight intensity={0.34 + room.brightness * 0.22} color={lightColor} />
      <hemisphereLight
        args={[lightColor, new THREE.Color("#6b5a48"), 0.42 + room.brightness * 0.2]}
      />

      {/* The window is the key light, and the only shadow caster — one is
          enough to read depth, and four would halve the frame rate. */}
      <directionalLight
        castShadow
        position={[
          winPos[0] * 1.4 || W * 0.3,
          winY + 0.6,
          hasSideWindow ? -D * 0.08 : -D / 2 + 0.5,
        ]}
        intensity={1.5 + room.windowStrength * 2.2}
        color={lightColor}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={Math.max(W, D) * 3}
        shadow-camera-left={-W}
        shadow-camera-right={W}
        shadow-camera-top={H}
        shadow-camera-bottom={-H}
        shadow-bias={-0.0012}
      />

      {/* soft fill from the window plane itself, so the reveal glows */}
      <pointLight
        position={winPos}
        intensity={0.7 + room.windowStrength * 1.6}
        color={lightColor}
        distance={Math.max(W, D) * 1.8}
        decay={1.6}
      />
      {/* Warm bounce off the timber floor.
          Placed toward the open front of the room, not the centre: at the
          centre it sits *inside* whatever furniture is there and blooms a hot
          spot on the nearest surface, which reads as a bug rather than as
          bounced light. */}
      <pointLight
        position={[0, floorY + 0.2, D * 0.34]}
        intensity={0.26}
        color="#c99a68"
        distance={Math.max(W, D) * 1.2}
        decay={2}
      />
    </group>
  );
}

/* -------------------------------- pieces ---------------------------------- */

/** Four boxes making a picture-frame outline in the XY plane. */
function Frame({
  w,
  h,
  thickness,
  depth,
  color,
}: {
  w: number;
  h: number;
  thickness: number;
  depth: number;
  color: string;
}) {
  const mat = <meshStandardMaterial color={color} roughness={0.38} />;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w + thickness, thickness, depth]} />
        {mat}
      </mesh>
      <mesh position={[0, -h / 2, 0]} castShadow>
        <boxGeometry args={[w + thickness, thickness, depth]} />
        {mat}
      </mesh>
      <mesh position={[-w / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, h, depth]} />
        {mat}
      </mesh>
      <mesh position={[w / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, h, depth]} />
        {mat}
      </mesh>
    </group>
  );
}

function Skirting({ W, D, y, color }: { W: number; D: number; y: number; color: string }) {
  const h = 0.11;
  const t = 0.025;
  const mat = <meshStandardMaterial color={color} roughness={0.4} />;
  return (
    <group position={[0, y + h / 2, 0]}>
      <mesh position={[0, 0, -D / 2 + t / 2]} castShadow receiveShadow>
        <boxGeometry args={[W, h, t]} />
        {mat}
      </mesh>
      <mesh position={[-W / 2 + t / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, D]} />
        {mat}
      </mesh>
      <mesh position={[W / 2 - t / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, D]} />
        {mat}
      </mesh>
    </group>
  );
}

/** A rug, which is what stops furniture looking like it is floating. */
function Rug({ w, d, z, y, color }: { w: number; d: number; z: number; y: number; color: string }) {
  return (
    <mesh position={[0, y + 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={0.98} />
    </mesh>
  );
}

function Plant({ x, z, y }: { x: number; z: number; y: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.28, 12]} />
        <meshStandardMaterial color="#9b7550" roughness={0.75} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.cos(i * 1.3) * 0.09, 0.46 + (i % 3) * 0.11, Math.sin(i * 1.3) * 0.09]}
          rotation={[0.5 - (i % 3) * 0.3, i * 1.3, 0.2]}
          castShadow
        >
          <sphereGeometry args={[0.13, 8, 6]} />
          <meshStandardMaterial color={i % 2 ? "#3f6b46" : "#4d7d51"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Lounge({
  W,
  D,
  y,
  accent,
  trim,
}: {
  W: number;
  D: number;
  y: number;
  accent: string;
  trim: string;
}) {
  const z = -D * 0.16;
  return (
    <group>
      <Rug w={Math.min(2.9, W * 0.72)} d={Math.min(2.0, D * 0.42)} z={z + 0.15} y={y} color="#8d7f6d" />

      {/* sofa: base, back, two cushions, two arms */}
      <group position={[0, y, z]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.05, 0.34, 0.86]} />
          <meshStandardMaterial color="#7d7263" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.53, -0.36]} castShadow receiveShadow>
          <boxGeometry args={[2.05, 0.42, 0.16]} />
          <meshStandardMaterial color="#877b6b" roughness={0.94} />
        </mesh>
        {[-0.5, 0.5].map((dx) => (
          <mesh key={dx} position={[dx, 0.42, 0.02]} castShadow>
            <boxGeometry args={[0.92, 0.14, 0.72]} />
            <meshStandardMaterial color={shade(accent, 0.34)} roughness={0.95} />
          </mesh>
        ))}
        {[-1.06, 1.06].map((dx) => (
          <mesh key={dx} position={[dx, 0.33, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.14, 0.6, 0.86]} />
            <meshStandardMaterial color="#6f6558" roughness={0.94} />
          </mesh>
        ))}
      </group>

      {/* coffee table */}
      <group position={[0, y, z + 0.95]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.05, 0.52]} />
          <meshStandardMaterial color="#6b4f34" roughness={0.5} />
        </mesh>
        {[
          [-0.44, -0.2],
          [0.44, -0.2],
          [-0.44, 0.2],
          [0.44, 0.2],
        ].map(([dx, dz]) => (
          <mesh key={`${dx}-${dz}`} position={[dx, 0.17, dz]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.34, 8]} />
            <meshStandardMaterial color="#4f3a26" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* floor lamp */}
      <group position={[W * 0.34, y, z - 0.1]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.04, 14]} />
          <meshStandardMaterial color={trim} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 1.4, 8]} />
          <meshStandardMaterial color="#3a352f" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.21, 0.26, 16, 1, true]} />
          <meshStandardMaterial color="#efe6d4" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <Plant x={-W * 0.36} z={D * 0.05} y={y} />
    </group>
  );
}

function Bed({
  W,
  D,
  y,
  accent,
  trim,
}: {
  W: number;
  D: number;
  y: number;
  accent: string;
  trim: string;
}) {
  // Against the back wall, where a bed actually goes — and out of the camera's
  // lap, so the walls stay the subject.
  const z = -D * 0.22;
  return (
    <group>
      <Rug w={Math.min(2.8, W * 0.7)} d={Math.min(1.7, D * 0.36)} z={z + 1.0} y={y} color="#8b7f6f" />
      <group position={[0, y, z]}>
        <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.34, 2.05]} />
          <meshStandardMaterial color="#6f6558" roughness={0.92} />
        </mesh>
        {/* mattress + duvet */}
        <mesh position={[0, 0.5, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[1.66, 0.2, 2.0]} />
          <meshStandardMaterial color="#e6dfd2" roughness={0.96} />
        </mesh>
        <mesh position={[0, 0.62, 0.32]} castShadow>
          <boxGeometry args={[1.66, 0.06, 1.3]} />
          <meshStandardMaterial color={shade(accent, 0.3)} roughness={0.95} />
        </mesh>
        {/* headboard */}
        <mesh position={[0, 0.72, -1.04]} castShadow receiveShadow>
          <boxGeometry args={[1.76, 0.9, 0.09]} />
          <meshStandardMaterial color={trim} roughness={0.45} />
        </mesh>
        {/* pillows */}
        {[-0.4, 0.4].map((dx) => (
          <mesh key={dx} position={[dx, 0.65, -0.76]} castShadow>
            <boxGeometry args={[0.68, 0.14, 0.36]} />
            <meshStandardMaterial color="#f3eee4" roughness={0.96} />
          </mesh>
        ))}
      </group>

      {/* bedside table + lamp */}
      <group position={[-1.12, y, z - 0.8]}>
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 0.56, 0.4]} />
          <meshStandardMaterial color="#6b4f34" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.14, 0.2, 14, 1, true]} />
          <meshStandardMaterial color="#efe6d4" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <Plant x={W * 0.35} z={D * 0.08} y={y} />
    </group>
  );
}

function Counter({ W, D, y, trim }: { W: number; D: number; y: number; trim: string }) {
  return (
    <group>
      {/* run of base units against the back wall */}
      <group position={[0, y, -D / 2 + 0.34]}>
        <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
          <boxGeometry args={[Math.min(3.2, W * 0.8), 0.88, 0.62]} />
          <meshStandardMaterial color={shade(trim, 0.1)} roughness={0.5} />
        </mesh>
        {/* worktop, a touch proud of the units */}
        <mesh position={[0, 0.9, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[Math.min(3.3, W * 0.82), 0.05, 0.68]} />
          <meshStandardMaterial color="#57534c" roughness={0.35} metalness={0.1} />
        </mesh>
        {/* handles */}
        {[-0.9, -0.3, 0.3, 0.9].map((dx) => (
          <mesh key={dx} position={[dx, 0.66, 0.33]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.26, 8]} />
            <meshStandardMaterial color="#b6a68c" roughness={0.3} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* wall units */}
      <mesh position={[0, y + 1.85, -D / 2 + 0.2]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(2.6, W * 0.66), 0.7, 0.34]} />
        <meshStandardMaterial color={trim} roughness={0.45} />
      </mesh>

      <Plant x={W * 0.34} z={-D * 0.05} y={y} />
    </group>
  );
}

function Desk({ W, D, y, trim }: { W: number; D: number; y: number; trim: string }) {
  const z = -D * 0.2;
  return (
    <group>
      <group position={[0, y, z]}>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.05, 0.72]} />
          <meshStandardMaterial color="#6b4f34" roughness={0.5} />
        </mesh>
        {[
          [-0.74, -0.3],
          [0.74, -0.3],
          [-0.74, 0.3],
          [0.74, 0.3],
        ].map(([dx, dz]) => (
          <mesh key={`${dx}-${dz}`} position={[dx, 0.37, dz]} castShadow>
            <boxGeometry args={[0.05, 0.72, 0.05]} />
            <meshStandardMaterial color="#4f3a26" roughness={0.6} />
          </mesh>
        ))}
        {/* monitor */}
        <mesh position={[0, 1.06, -0.2]} castShadow>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <meshStandardMaterial color="#26262a" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.83, -0.2]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.12]} />
          <meshStandardMaterial color="#33333a" roughness={0.5} />
        </mesh>
      </group>

      {/* chair */}
      <group position={[0, y, z + 0.78]}>
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.07, 0.5]} />
          <meshStandardMaterial color="#4a4640" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.72, 0.22]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.06]} />
          <meshStandardMaterial color="#4a4640" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
          <meshStandardMaterial color="#2f2d2a" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      <Plant x={-W * 0.36} z={D * 0.06} y={y} />
      <mesh position={[W * 0.36, y + 0.9, -D * 0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 1.8, 0.34]} />
        <meshStandardMaterial color={shade(trim, 0.14)} roughness={0.5} />
      </mesh>
    </group>
  );
}
