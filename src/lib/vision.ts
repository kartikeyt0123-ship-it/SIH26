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

/**
 * What was actually photographed.
 *
 * "wall" is a flat elevation — someone stood in front of one surface and
 * photographed it. "room" is an interior with depth, a floor line and usually a
 * corner. Rebuilding the second as the first loses the space; rebuilding the
 * first as the second invents three walls, a floor and furniture that are not
 * in the picture, which is worse — the customer is judging a colour against a
 * room we made up.
 */
export type SceneKind = "wall" | "room";

/**
 * A block of something-that-is-not-wall standing on the floor.
 *
 * Deliberately not called furniture in the geometry: this is a silhouette
 * lifted from the photograph, and the analysis has no idea whether it is a
 * sofa, a cupboard or a stack of boxes. It carries its measured position, size
 * and its colour SAMPLED FROM THE PHOTOGRAPH, which is what makes the
 * reconstruction resemble the room rather than a showroom.
 */
export type Mass = {
  /** 0..1 across the frame, left to right. */
  centre: number;
  /** Fraction of the frame width. */
  width: number;
  /** Fraction of the wall height, measured up from the floor line. */
  height: number;
  /** Average colour of the region, taken from the photograph. */
  hex: string;
  /** 0..1 — how clearly it separates from the wall. Weak ones are dropped. */
  strength: number;
};

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
  /** One flat surface, or a space. Decides what the viewer builds. */
  scene: SceneKind;
  /** 0..1 confidence in that call, so the UI can hedge when it is marginal. */
  sceneConfidence: number;
  /** Objects standing against the wall, as measured. Empty is a real answer. */
  masses: Mass[];
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

  const rowMean = (y: number) => {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      s += (px[i] + px[i + 1] + px[i + 2]) / 3;
    }
    return s / w;
  };

  /**
   * The floor line: the widest horizontal change, not the strongest.
   *
   * Taking the strongest row transition finds the top edge of the tallest
   * piece of furniture in a furnished room — a sofa back is a harder contrast
   * than a wall meeting a pale floor. Every object standing above that false
   * line then becomes invisible, because the object search works upward from
   * it. That is exactly how a room with a sofa and a cupboard came back with
   * only the cupboard.
   *
   * A real floor line has one property furniture does not: it runs the full
   * width of the frame. So the score is coverage — the share of columns that
   * change at this row — multiplied by how much they change. A sofa spanning a
   * third of the frame cannot beat a floor spanning all of it.
   */
  const lumaAtPx = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (px[i] + px[i + 1] + px[i + 2]) / 3;
  };

  let bestY = Math.round(h * 0.72);
  let bestScore = -1;
  let bestD = 0;
  for (let y = Math.round(h * 0.4); y < h - 3; y++) {
    let changed = 0;
    let total = 0;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(lumaAtPx(x, y) - lumaAtPx(x, y + 2));
      if (d > 7) changed++;
      total += d;
    }
    const coverage = changed / w;
    const mean = total / w;
    const score = coverage * mean;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
      bestD = mean;
    }
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

  /* ------------------- is this one wall, or a whole room? ----------------- */

  const at = (x: number, y: number) => {
    const i = (Math.max(0, Math.min(w - 1, x)) + Math.max(0, Math.min(h - 1, y)) * w) * 4;
    return { r: px[i], g: px[i + 1], b: px[i + 2] };
  };
  const labAt = (x: number, y: number) => hexToLab(rgbToHex(at(x, y)));

  const regionLab = (x0: number, x1: number, y0: number, y1: number) => {
    let L = 0;
    let a = 0;
    let b = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const l = labAt(x, y);
        L += l.L;
        a += l.a;
        b += l.b;
        n++;
      }
    }
    return n ? { L: L / n, a: a / n, b: b / n } : { L: 50, a: 0, b: 0 };
  };

  const dE = (p: { L: number; a: number; b: number }, q: { L: number; a: number; b: number }) =>
    Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

  // 1. A vertical corner. A room photographed into a corner has one strong
  //    column-to-column break; a flat elevation has none.
  const colMean = (x: number) => {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      s += (px[i] + px[i + 1] + px[i + 2]) / 3;
    }
    return s / h;
  };
  let cornerD = 0;
  for (let x = Math.round(w * 0.12); x < Math.round(w * 0.88); x++) {
    cornerD = Math.max(cornerD, Math.abs(colMean(x) - colMean(x + 2)));
  }

  // 2. Does the bottom of the frame look like a different material from the
  //    top? A floor does; more wall does not.
  const topLab = regionLab(0, w, 0, Math.round(h * 0.3));
  const botLab = regionLab(0, w, Math.round(h * 0.78), h);
  const floorContrast = dE(topLab, botLab);

  // 3. How much of the frame is one single colour. A wall photographed
  //    head-on is overwhelmingly one cluster.
  const concentration = palette[0]?.share ?? 0.5;

  // Each signal normalised to 0..1 and summed. No single one is reliable —
  // a plain wall with a shadow across it has a floor-like contrast, and a room
  // shot square at a blank wall has no corner — but three agreeing rarely lie.
  const roomScore =
    Math.min(1, bestD / 26) * 0.3 +
    Math.min(1, cornerD / 22) * 0.24 +
    Math.min(1, floorContrast / 22) * 0.34 +
    Math.min(1, Math.max(0, 0.62 - concentration) / 0.3) * 0.12;

  /* ----------------------- what is standing on the floor ------------------ */

  // Wall reference taken from the upper band, away from both the floor line and
  // the brightest region, so a window does not become "the wall colour".
  const wallLab = regionLab(Math.round(w * 0.1), Math.round(w * 0.9), Math.round(h * 0.08), Math.round(h * 0.34));

  const floorY = bestY;
  const topOfSearch = Math.max(2, Math.round(floorY - h * 0.5));
  const colHeight = new Array(w).fill(0);

  for (let x = 0; x < w; x++) {
    let run = 0;
    // Upward from the floor line: an object touches the floor, so its
    // silhouette is a run that starts there. Scanning the whole column instead
    // would pick up pictures, switches and shadows floating on the wall.
    for (let y = floorY - 1; y >= topOfSearch; y--) {
      const l = labAt(x, y);
      const differs = dE(l, wallLab) > 15 && l.L < wallLab.L + 6;
      if (!differs) break;
      run++;
    }
    colHeight[x] = run;
  }

  const minRun = Math.max(3, Math.round(h * 0.05));
  const masses: Mass[] = [];
  let x0 = -1;

  const flush = (x1: number) => {
    if (x0 < 0) return;
    const width = x1 - x0;
    // Narrower than a twentieth of the frame is noise — a skirting shadow or a
    // cable, not something worth building.
    if (width >= Math.max(3, Math.round(w * 0.05))) {
      let peak = 0;
      for (let x = x0; x < x1; x++) peak = Math.max(peak, colHeight[x]);
      const top = Math.max(topOfSearch, floorY - peak);
      const lab = regionLab(x0, x1, top, floorY);
      const rgbHex = averageRegionHex(px, w, x0, x1, top, floorY);
      masses.push({
        centre: (x0 + x1) / 2 / w,
        width: width / w,
        height: Math.min(0.95, peak / (floorY || 1)),
        hex: rgbHex,
        strength: Math.min(1, dE(lab, wallLab) / 30),
      });
    }
    x0 = -1;
  };

  for (let x = 0; x < w; x++) {
    if (colHeight[x] >= minRun) {
      if (x0 < 0) x0 = x;
    } else {
      flush(x);
    }
  }
  flush(w);

  return {
    palette,
    floorRatio: bestY / h,
    brightness,
    windowStrength,
    windowCentre: cx,
    edgeStrength: bestD / 255,
    roomScore,
    masses: masses
      .filter((m) => m.strength > 0.25)
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, 4),
  };
}

/** Mean colour of a rectangle, as a hex — used to tint a mass from the photo. */
function averageRegionHex(
  px: Uint8ClampedArray,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
  }
  return n ? rgbToHex({ r: r / n, g: g / n, b: b / n }) : "#7d7263";
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
      scene: "room",
      sceneConfidence: 0,
      masses: [],
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

  /* --------------------------- wall or room? ----------------------------- */

  // Averaged across frames, then thresholded once. Deciding per frame and
  // voting would let one close-up of a corner outvote two wide shots.
  const roomScore = avg((r) => r.roomScore);
  const scene: SceneKind = roomScore >= 0.5 ? "room" : "wall";
  // Distance from the fence, doubled — a score of 0.5 is a coin toss and the
  // UI should say so rather than assert.
  const sceneConfidence = Math.min(1, Math.abs(roomScore - 0.5) * 2.4);

  // Masses come from the single frame that saw the most, rather than being
  // averaged: two photographs of different corners have different furniture in
  // them, and averaging their positions puts a sofa where neither one is.
  const richest = results.reduce((a, b) => (b.masses.length > a.masses.length ? b : a));
  const masses = scene === "room" || richest.masses.length ? richest.masses : [];

  const notes: string[] = [];
  notes.push(
    scene === "wall"
      ? `${frames.length} photograph${frames.length > 1 ? "s" : ""} read as a single wall, so that is what has been rebuilt — one surface, not an invented room.`
      : `${frames.length} photograph${frames.length > 1 ? "s" : ""} read. Room proportions are estimated from the frame against a standard 3 m ceiling, not measured.`,
  );
  if (sceneConfidence < 0.3) {
    notes.push(
      scene === "wall"
        ? "It was a close call between one wall and a whole room — if this should be a room, add a photograph taken from further back."
        : "It was a close call between a whole room and a single wall.",
    );
  }
  if (masses.length) {
    notes.push(
      `${masses.length} object${masses.length > 1 ? "s" : ""} standing against the wall ${masses.length > 1 ? "were" : "was"} traced from the photograph and placed as ${masses.length > 1 ? "blocks" : "a block"}, in ${masses.length > 1 ? "their" : "its"} own colour. Shapes are approximate.`,
    );
  } else if (scene === "room") {
    notes.push("Nothing was clearly standing against the walls, so the room is shown empty.");
  }
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
    scene,
    sceneConfidence,
    masses,
  };
}

/** The most saturated colour already in the room — a useful anchor to sit with. */
export function strongestTone(room: RoomModel) {
  return (
    [...room.palette].sort((a, b) => hexToHsl(b.hex).s - hexToHsl(a.hex).s)[0]?.hex ??
    room.dominantHex
  );
}

/**
 * Downscale before upload.
 *
 * A modern phone camera produces 3–5 MB per shot. Three of those over a mobile
 * connection is tens of seconds of waiting, and none of that resolution is used
 * — the analysis samples at 96px and the room viewer never shows the photo at
 * more than thumbnail size. Resizing on the device turns a 4 MB upload into
 * roughly 200 KB, which is the difference between "instant" and "did it
 * freeze?".
 */
export async function compressForUpload(file: File, max = 1400, quality = 0.78): Promise<File> {
  // Anything already small enough goes as-is; re-encoding it would only lose
  // quality for no bandwidth gain.
  if (file.size < 350 * 1024) return file;
  try {
    const dataUrl = await fileToThumbnail(file, max, quality);
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // If canvas encoding fails for any reason, send the original rather than
    // losing the customer's photograph.
    return file;
  }
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
