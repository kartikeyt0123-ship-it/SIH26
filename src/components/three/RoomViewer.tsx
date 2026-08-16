"use client";

import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { RoomModel } from "@/lib/vision";

/**
 * The customer's own room, rebuilt as geometry they can repaint and walk around.
 *
 * Proportions, the floor line, the window side and the light temperature all
 * come from `analyzeRoomPhotos`. It is a reconstruction, not a measurement —
 * the UI says so, and nothing in the quotation is derived from it.
 *
 * Deliberately simple materials: flat, slightly rough, no texture maps. The
 * customer is judging a colour, and any texture we invent is a texture their
 * wall does not have.
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
  className,
}: {
  room: RoomModel;
  colors: SchemeColors;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 62, position: [0, 0.1, room.depthM * 0.42], near: 0.05, far: 60 }}
      >
        <Suspense fallback={null}>
          <RoomGeometry room={room} colors={colors} />
          <OrbitControls
            enablePan={false}
            minDistance={0.6}
            maxDistance={room.depthM * 0.62}
            minPolarAngle={Math.PI * 0.28}
            maxPolarAngle={Math.PI * 0.68}
            target={[0, -0.2, -room.depthM * 0.25]}
            enableDamping
            dampingFactor={0.08}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

function RoomGeometry({ room, colors }: { room: RoomModel; colors: SchemeColors }) {
  const W = room.widthM;
  const H = room.heightM;
  const D = room.depthM;

  // Warm rooms get a warmer key light. This is the single biggest reason a
  // shade card never matches the wall, so the viewer at least admits it exists.
  const lightColor = useMemo(() => {
    const warm = new THREE.Color("#ffe6c4");
    const cool = new THREE.Color("#d8e6ff");
    const t = (room.lightWarmth + 1) / 2;
    return cool.clone().lerp(warm, t);
  }, [room.lightWarmth]);

  const windowX = room.windowSide === "left" ? -W / 2 + 0.02 : room.windowSide === "right" ? W / 2 - 0.02 : 0;
  const hasSideWindow = room.windowSide === "left" || room.windowSide === "right";
  const intensity = 1.4 + room.windowStrength * 8;

  const wall = (color: string, roughness = 0.95) => (
    <meshStandardMaterial color={color} roughness={roughness} metalness={0} side={THREE.DoubleSide} />
  );

  return (
    <group position={[0, 0, 0]}>
      {/* floor — a neutral, so it never competes with the colour being judged */}
      <mesh position={[0, -H / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#8d8073" roughness={0.85} />
      </mesh>

      {/* ceiling */}
      <mesh position={[0, H / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        {wall(colors.ceiling, 0.98)}
      </mesh>

      {/* back wall — this is the feature surface */}
      <mesh position={[0, 0, -D / 2]}>
        <planeGeometry args={[W, H]} />
        {wall(colors.feature)}
      </mesh>

      {/* side walls */}
      <mesh position={[-W / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {wall(colors.main)}
      </mesh>
      <mesh position={[W / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {wall(colors.main)}
      </mesh>

      {/* front wall, behind the camera — keeps bounce light honest */}
      <mesh position={[0, 0, D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        {wall(colors.main)}
      </mesh>

      {/* skirting, in the trim colour */}
      <mesh position={[0, -H / 2 + 0.06, -D / 2 + 0.03]}>
        <boxGeometry args={[W, 0.12, 0.03]} />
        <meshStandardMaterial color={colors.trim} roughness={0.4} />
      </mesh>

      {/* window */}
      {room.windowSide !== "none" && (
        <group
          position={
            hasSideWindow ? [windowX, 0.15, -D * 0.1] : [W * 0.18, 0.15, -D / 2 + 0.02]
          }
          rotation={[0, hasSideWindow ? (room.windowSide === "left" ? Math.PI / 2 : -Math.PI / 2) : 0, 0]}
        >
          <mesh>
            <planeGeometry args={[Math.min(1.9, D * 0.5), Math.min(1.5, H * 0.5)]} />
            <meshBasicMaterial color="#fbf3e4" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[0.05, Math.min(1.5, H * 0.5)]} />
            <meshStandardMaterial color={colors.trim} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* a door on the near-left, in the trim colour, for scale */}
      <mesh position={[-W / 2 + 0.03, -H / 2 + 1.0, D * 0.22]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 2.0]} />
        <meshStandardMaterial color={colors.trim} roughness={0.35} />
      </mesh>

      <ambientLight intensity={0.55 + room.brightness * 0.3} color={lightColor} />
      <pointLight
        position={hasSideWindow ? [windowX * 0.8, 0.4, -D * 0.1] : [W * 0.18, 0.4, -D / 2 + 0.4]}
        intensity={intensity}
        color={lightColor}
        distance={Math.max(W, D) * 2.4}
        decay={1.4}
      />
      <pointLight position={[0, H / 2 - 0.2, 0]} intensity={0.55} color="#ffffff" distance={Math.max(W, D) * 2} decay={1.6} />
    </group>
  );
}
