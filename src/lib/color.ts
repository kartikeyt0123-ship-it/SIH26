/**
 * Colour maths.
 *
 * Implemented directly rather than pulled from a dependency, because the whole
 * product rests on being able to say "this finish is 1.4 ΔE from the one you
 * asked for" and defend it. CIEDE2000 is the only comparison metric used
 * anywhere in the app; nothing compares colours by eye or by RGB distance.
 */

export type RGB = { r: number; g: number; b: number };
export type Lab = { L: number; a: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* ------------------------------- CIELAB -------------------------------- */

const D65 = { x: 95.047, y: 100.0, z: 108.883 };

export function rgbToLab({ r, g, b }: RGB): Lab {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(r) * 100;
  const G = lin(g) * 100;
  const B = lin(b) * 100;

  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / D65.x;
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / D65.y;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / D65.z;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex));

/** CIEDE2000. The industry comparison metric; ΔE bands are quoted from it. */
export function deltaE(l1: Lab, l2: Lab): number {
  const kL = 1, kC = 1, kH = 1;
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const C1 = Math.hypot(l1.a, l1.b);
  const C2 = Math.hypot(l2.a, l2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * l1.a;
  const a2p = (1 + G) * l2.a;
  const C1p = Math.hypot(a1p, l1.b);
  const C2p = Math.hypot(a2p, l2.b);

  const h1p = C1p === 0 ? 0 : (Math.atan2(l1.b, a1p) * deg + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(l2.b, a2p) * deg + 360) % 360;

  const dLp = l2.L - l1.L;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    dhp = diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);

  const Lbarp = (l1.L + l2.L) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += h1p + h2p < 360 ? 360 : -360;
    hbarp /= 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt(
    Math.pow(dLp / (kL * Sl), 2) +
      Math.pow(dCp / (kC * Sc), 2) +
      Math.pow(dHp / (kH * Sh), 2) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)),
  );
}

export const deltaEHex = (a: string, b: string) => deltaE(hexToLab(a), hexToLab(b));

/** The only wording allowed for a ΔE figure anywhere in the product. */
export function deltaBand(dE: number) {
  if (dE < 1) return "not perceptible";
  if (dE < 2) return "perceptible on close inspection";
  if (dE < 3.5) return "perceptible at a glance";
  return "clearly different";
}

/* --------------------------------- HSL --------------------------------- */

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: HSL) {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** Relative luminance — used to decide whether a surface needs dark or light trim. */
export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const isLight = (hex: string) => luminance(hex) > 0.45;

/** Average a set of hexes in Lab space, which keeps mixtures perceptually sane. */
export function averageHex(hexes: string[]) {
  if (!hexes.length) return "#ffffff";
  const labs = hexes.map(hexToLab);
  const m = labs.reduce(
    (acc, l) => ({ L: acc.L + l.L / labs.length, a: acc.a + l.a / labs.length, b: acc.b + l.b / labs.length }),
    { L: 0, a: 0, b: 0 },
  );
  return labToHex(m);
}

export function labToHex({ L, a, b }: Lab) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (Math.pow(t, 3) > 0.008856 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787);
  const x = (inv(fx) * D65.x) / 100;
  const y = (inv(fy) * D65.y) / 100;
  const z = (inv(fz) * D65.z) / 100;

  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  return rgbToHex({ r: gam(R) * 255, g: gam(G) * 255, b: gam(B) * 255 });
}
