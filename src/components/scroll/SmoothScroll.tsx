"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/lib/motion";
import { setPointer } from "@/lib/story";

/**
 * One scroll authority for the whole page.
 *
 * Lenis drives scroll position, GSAP's ticker drives Lenis, and ScrollTrigger
 * is told to ask Lenis for the scroll value. Running Lenis on its own rAF
 * alongside GSAP's ticker produces a one-frame skew between the DOM pins and
 * the WebGL scene, which reads as the 3D "lagging behind" the text.
 *
 * Under prefers-reduced-motion, Lenis is not started at all — native scroll,
 * no interpolation, no inertia.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const onPointer = (e: PointerEvent) => {
      setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    if (prefersReducedMotion()) {
      ScrollTrigger.refresh();
      return () => window.removeEventListener("pointermove", onPointer);
    }

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
      syncTouch: false,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Fonts change layout height; stale trigger positions are the usual cause
    // of a pinned section ending in the wrong place.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      window.removeEventListener("pointermove", onPointer);
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return <>{children}</>;
}
