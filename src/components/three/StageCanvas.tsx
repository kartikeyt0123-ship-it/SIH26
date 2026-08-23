"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Composition } from "./Composition";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Performance contract for the WebGL layer:
 *
 * - ONE canvas for the whole page. Mounting a second one doubles the context,
 *   the render loop and the memory, for no narrative gain.
 * - It renders only while the stage is on screen. Off screen, frameloop is
 *   "never" — the GPU goes quiet for the rest of the page.
 * - DPR is capped at 1.75. Retina at 3x costs ~3x the fragments and the scene
 *   is soft-lit matte material; nobody can see the difference.
 * - No post-processing and no HDR download. One shadow-casting light on
 *   capable devices, none on low-power ones, plus fill lights and three
 *   light-formers.
 * - Below 640px, or on a device reporting few cores, a reduced composition
 *   runs: smaller chip grid, cheaper bevels, no environment.
 * - prefers-reduced-motion still renders the scene, but as a still image —
 *   the argument is visual, so removing it entirely would remove content.
 */
export function StageCanvas({ className }: { className?: string }) {
  const [active, setActive] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [ready, setReady] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const small = window.matchMedia("(max-width: 639px)").matches;
    const cores = navigator.hardwareConcurrency ?? 8;
    setLowPower(small || cores <= 4);
    setReady(true);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), {
      rootMargin: "20% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const still = ready && prefersReducedMotion();

  return (
    <div ref={wrap} className={className} aria-hidden="true">
      {ready && (
        <Canvas
          frameloop={still ? "demand" : active ? "always" : "never"}
          dpr={[1, lowPower ? 1.25 : 1.75]}
          // Shadows only where there is headroom for them. They are what makes
          // the furniture sit in the room rather than hover in front of it, but
          // a shadow map on a four-core phone costs more than it returns.
          shadows={lowPower ? false : { type: THREE.PCFSoftShadowMap }}
          gl={{
            antialias: !lowPower,
            alpha: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
          }}
          camera={{ fov: 38, position: [0.4, 0.35, 7.4], near: 0.1, far: 60 }}
        >
          <Suspense fallback={null}>
            <Composition lowPower={lowPower} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
