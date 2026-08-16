"use client";

/**
 * Photo → room model.
 *
 * WHAT THIS IS, PLAINLY: an in-browser heuristic, not a trained network. It
 * runs k-means over a downsampled copy of each photograph to get the real
 * palette, finds the strongest horizontal gradient in the lower half to place
 * the floor line, locates the brightest region to place the window, and derives
 * plausible room proportions from the frame. From that it builds a parametric
 * room the customer can repaint and walk around.
 *
 * WHAT IT IS NOT: photogrammetry. It does not measure the room, and nothing
 * downstream is allowed to claim it does — quantities always come from the
 * customer's own measurements (see `quote.ts`).
 *
 * WHERE THE REAL MODEL GOES: `analyzeRoomPhotos` is the only entry point, and
 * `RoomModel` is the only thing the rest of the app consumes. Swapping this for
 * a hosted vision call (segmentation + depth + defect classification) is a
 * change to this one function, and every screen keeps working.
 */

import { averageHex, hexToHsl, hexToLab, rgbToHex } from "./color";

export type RoomModel = {
  /** Metres. Derived from frame proportions against a standard ceiling height. */
  widthM: number;
  heightM: number;
  depthM: number;
  /** 0..1 — where the wall meets the floor in the source frame. */
  floorRatio: number;
  windowSide: "left" | "right" | "back" | "none";
  windowStrength: number;
  /** -1 cool … +1 warm. Drives the light colour in the 3D scene. */
  lightWarmth: number;
  brightness: number;
  palette: { hex: string; share: number }[];
  dominantHex: string;
  confidence: "low" | "medium";
  notes: string[];
};

const SAMPLE = 96;

async function loadToCanvas(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = SAMPLE;
      c.height = SAMPLE;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
      resolve(ctx.getImageData(0, 0, SAMPLE, SAMPLE));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** k-means in Lab, so clusters split the way an eye would split them. */
function kmeans(pixels: [number, number, number][], k: number, iters = 10) {
  if (!pixels.length) return [];
  const centres = Array.from({ length: k }, (_, i) => pixels[Math.floor((i + 0.5) * pixels.length / k)]);
  const labOf = (p: [number, number, number]) => hexToLab(rgbToHex({ r: p[0], g: p[1], b: p[2] }));
  const centreLabs = centres.map(labOf);
  let assign = new Array(pixels.length).fill(0);

  for (let it = 0; it < iters; it++) {
    const pixLabs = pixels.map(labOf);
    assign = pixLabs.map((pl) => {
      let best = 0;
      let bestD = Infinity;
      centreLabs.forEach((cl, ci) => {
        const d = (pl.L - cl.L) ** 2 + (pl.a - cl.a) ** 2 + (pl.b - cl.b) ** 2;
        if (d < bestD) { bestD = d; best = ci; }
      });
      return best;
    });

    for (let ci = 0; ci < k; ci++) {
      const members = pixels.filter((_, i) => assign[i] === ci);
      if (!members.length) continue;
      const m: [number, number, number] = [
        members.reduce((s, p) => s + p[0], 0) / members.length,
        members.reduce((s, p) => s + p[1], 0) / members.length,
        members.reduce((s, p) => s + p[2], 0) / members.length,
      ];
      centres[ci] = m;
      centreLabs[ci] = labOf(m);
    }
  }

  return centres
    .map((c, ci) => ({
      hex: rgbToHex({ r: c[0], g: c[1], b: c[2] }),
      share: assign.filter((a) => a === ci).length / pixels.length,
    }))
    .filter((c) => c.share > 0.02)
    .sort((a, b) => b.share - a.share);
}

function analyseOne(data: ImageData) {
  const { width: w, height: h, data: px } = data;

  const pixels: [number, number, number][] = [];
  for (let i = 0; i < px.length; i += 4 * 3) {
    pixels.push([px[i], px[i + 1], px[i + 2]]);
  }

  const palette = kmeans(pixels, 5);

  // Floor line: the strongest horizontal change in the lower two-thirds.
  const rowMean = (y: number) => {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      s += (px[i] + px[i + 1] + px[i + 2]) / 3;
    }
    return s / w;
  };
  let bestY = Math.round(h * 0.72);
  let bestD = -1;
  for (let y = Math.round(h * 0.4); y < h - 2; y++) {
    const d = Math.abs(rowMean(y) - rowMean(y + 2));
    if (d > bestD) { bestD = d; bestY = y; }
  }

  // Window: the brightest sustained region, and which third it sits in.
  let brightSum = 0;
  let brightX = 0;
  let brightCount = 0;
  let lumaSum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
      lumaSum += l;
      if (l > 205) {
        brightSum += l;
        brightX += x;
        brightCount++;
      }
    }
  }

  const brightness = lumaSum / (w * h) / 255;
  const windowStrength = brightCount / (w * h);
  const cx = brightCount ? brightX / brightCount / w : 0.5;

  return {
    palette,
    floorRatio: bestY / h,
    brightness,
    windowStrength,
    windowCentre: cx,
    edgeStrength: bestD / 255,
  };
}

export async function analyzeRoomPhotos(sources: string[]): Promise<RoomModel> {
  const frames = (await Promise.all(sources.map(loadToCanvas))).filter(Boolean) as ImageData[];

  if (!frames.length) {
    return {
      widthM: 4.2, heightM: 3.0, depthM: 3.6, floorRatio: 0.72,
      windowSide: "left", windowStrength: 0.06, lightWarmth: 0.2, brightness: 0.5,
      palette: [{ hex: "#cfc7b8", share: 1 }], dominantHex: "#cfc7b8",
      confidence: "low",
      notes: ["No photographs were readable, so a standard room was used."],
    };
  }

  const results = frames.map((f) => ({ ...analyseOne(f), aspect: f.width / f.height }));
  const avg = (fn: (r: (typeof results)[number]) => number) =>
    results.reduce((s, r) => s + fn(r), 0) / results.length;

  // Merge palettes across frames, weighted by their share in each.
  const merged = new Map<string, number>();
  results.forEach((r) =>
    r.palette.forEach((p) => merged.set(p.hex, (merged.get(p.hex) ?? 0) + p.share / results.length)),
  );
  const palette = [...merged.entries()]
    .map(([hex, share]) => ({ hex, share }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  const floorRatio = Math.min(0.86, Math.max(0.55, avg((r) => r.floorRatio)));
  const brightness = avg((r) => r.brightness);
  const windowStrength = avg((r) => r.windowStrength);
  const centre = avg((r) => r.windowCentre);

  // Proportions. ASSUMPTION: a 3.0 m ceiling, which is the common slab height
  // in Indian residential construction. Everything else scales off it.
  const heightM = 3.0;
  const wallHeightInFrame = floorRatio;
  const widthM = Math.min(7, Math.max(3, (heightM / wallHeightInFrame) * 1.35));
  const depthM = Math.min(6.5, Math.max(2.8, widthM * 0.82));

  const dominantHex = averageHex(palette.slice(0, 2).map((p) => p.hex));
  const lab = hexToLab(dominantHex);
  const lightWarmth = Math.max(-1, Math.min(1, (lab.b - lab.a * 0.4) / 30));

  const notes: string[] = [];
  notes.push(
    `${frames.length} photograph${frames.length > 1 ? "s" : ""} read. Room proportions are estimated from the frame against a standard 3 m ceiling, not measured.`,
  );
  if (windowStrength < 0.015) notes.push("No strong light source found — the room is lit evenly in the model.");
  if (brightness < 0.32) notes.push("The photographs are dark, so wall colours here may look deeper than in daylight.");
  const warmWord = lightWarmth > 0.15 ? "warm" : lightWarmth < -0.15 ? "cool" : "neutral";
  notes.push(`Existing tones read as ${warmWord}; the recommendations are weighted to sit with them.`);

  return {
    widthM,
    heightM,
    depthM,
    floorRatio,
    windowSide: windowStrength < 0.015 ? "none" : centre < 0.38 ? "left" : centre > 0.62 ? "right" : "back",
    windowStrength: Math.min(0.25, windowStrength),
    lightWarmth,
    brightness,
    palette,
    dominantHex,
    confidence: frames.length >= 2 && windowStrength > 0.01 ? "medium" : "low",
    notes,
  };
}

/** The most saturated colour already in the room — a useful anchor to sit with. */
export function strongestTone(room: RoomModel) {
  return (
    [...room.palette].sort((a, b) => hexToHsl(b.hex).s - hexToHsl(a.hex).s)[0]?.hex ??
    room.dominantHex
  );
}

/** Downscale an uploaded file so three photographs fit comfortably in storage. */
export function fileToThumbnail(file: File, max = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("canvas unavailable"));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("unreadable image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("unreadable file"));
    reader.readAsDataURL(file);
  });
}
