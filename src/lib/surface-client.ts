"use client";

/**
 * Browser runner for the surface analyser.
 *
 * The photographs are already in the customer's browser, so the pixels are read
 * there and only the resulting report crosses the network. That keeps the image
 * bytes off a second hop, keeps the server free of a canvas dependency, and
 * means the analysis costs the dealer nothing per run.
 *
 * It also yields between images. Reading three frames back to back is enough
 * work to drop frames on a mid-range phone, and this screen is the one where
 * the customer is watching a progress line.
 */

import { measure, reportFrom, type Metrics, type SurfaceReport, SAMPLE_SIZE } from "./surface";

async function loadPixels(src: string): Promise<{ px: Uint8ClampedArray; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = SAMPLE_SIZE;
      c.height = SAMPLE_SIZE;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const d = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      resolve({ px: d.data, w: d.width, h: d.height });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const yieldToPaint = () =>
  new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function analyseSurfaces(
  urls: string[],
  surface: "interior" | "exterior",
  onProgress?: (done: number, total: number) => void,
): Promise<SurfaceReport | null> {
  if (!urls.length) return null;

  const metrics: Metrics[] = [];
  for (let i = 0; i < urls.length; i++) {
    const loaded = await loadPixels(urls[i]);
    if (loaded) metrics.push(measure(loaded.px, loaded.w, loaded.h));
    onProgress?.(i + 1, urls.length);
    await yieldToPaint();
  }

  // Every photograph failed to load — a report built on nothing would be a
  // clean bill of health the customer did not earn, so return nothing instead.
  if (!metrics.length) return null;
  return reportFrom(metrics, surface);
}
