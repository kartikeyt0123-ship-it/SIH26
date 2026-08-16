import * as THREE from "three";

/**
 * Procedural material textures, drawn to a 2D canvas at runtime.
 *
 * Why not image files: a dealer's catalogue is thousands of finishes, and a
 * landing page cannot ship photographs of any of them without licensing and
 * megabytes. These are stylised, generated once, cached, and total ~0 KB over
 * the wire. They are recognisable as tile / wallpaper / timber / stone / render
 * at a glance, which is all the scene needs them to be.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

function grain(ctx: CanvasRenderingContext2D, s: number, amount: number) {
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Flat emulsion with the faint roller texture you get on a plastered wall. */
export function paintTexture(hex: string) {
  return make(`paint:${hex}`, 256, (ctx, s) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 14);
  });
}

/** Vitrified tile: a grid with grout lines and a soft diagonal sheen. */
export function tileTexture(hex: string, grout = "#8e887c", n = 4) {
  return make(`tile:${hex}:${n}`, 512, (ctx, s) => {
    const cell = s / n;
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = hex;
        ctx.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
        // veining
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x * cell + 6, y * cell + cell * (0.3 + Math.random() * 0.4));
        ctx.bezierCurveTo(
          x * cell + cell * 0.4, y * cell + cell * Math.random(),
          x * cell + cell * 0.6, y * cell + cell * Math.random(),
          x * cell + cell - 6, y * cell + cell * (0.3 + Math.random() * 0.4),
        );
        ctx.stroke();
      }
    }
    grain(ctx, s, 8);
  });
}

/** Wallpaper: a damask-ish repeating motif on a tinted ground. */
export function wallpaperTexture(ground: string, motif: string) {
  return make(`paper:${ground}:${motif}`, 256, (ctx, s) => {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = motif;
    ctx.fillStyle = motif;
    ctx.lineWidth = 2;
    const step = s / 4;
    for (let y = 0; y <= 4; y++) {
      for (let x = 0; x <= 4; x++) {
        const cx = x * step + (y % 2 ? step / 2 : 0);
        const cy = y * step;
        ctx.beginPath();
        ctx.ellipse(cx, cy, step * 0.19, step * 0.34, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, step * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    grain(ctx, s, 8);
  });
}

/** Timber / laminate: grain lines with occasional knots. */
export function timberTexture(base: string, dark: string) {
  return make(`timber:${base}:${dark}`, 512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * s;
      ctx.strokeStyle = dark;
      ctx.globalAlpha = 0.08 + Math.random() * 0.22;
      ctx.lineWidth = 0.6 + Math.random() * 2.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 16, s * 0.7, y + (Math.random() - 0.5) * 16, s, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // plank seams
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (s / 4) * i);
      ctx.lineTo(s, (s / 4) * i);
      ctx.stroke();
    }
  });
}

/** Stone / terrazzo: mottled aggregate. */
export function stoneTexture(base: string) {
  return make(`stone:${base}`, 512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const chips = ["#ffffff", "#c9c2b4", "#8a8477", "#6d6a63", "#c79a45"];
    for (let i = 0; i < 460; i++) {
      ctx.fillStyle = chips[i % chips.length];
      ctx.globalAlpha = 0.16 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * s, Math.random() * s,
        2 + Math.random() * 7, 2 + Math.random() * 5,
        Math.random() * Math.PI, 0, Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function disposeTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
