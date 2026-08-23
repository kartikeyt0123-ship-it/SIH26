/**
 * A very small PDF writer — enough for a quotation, and nothing more.
 *
 * WHY NOT A LIBRARY: the whole requirement is a few hundred lines of text, some
 * rules and a couple of filled rectangles on A4. Every PDF package that does
 * that also carries font subsetting, canvas emulation and an image pipeline,
 * which is megabytes of dependency and a serverless cold start, for a document
 * that is really a list. The PDF format's text-and-rectangle subset is small
 * enough to write directly, and doing so keeps the deploy honest about what it
 * ships.
 *
 * WHAT IT SUPPORTS: the 14 standard PDF fonts (no embedding needed — every
 * reader has them), WinAnsi text, filled rectangles, and automatic page breaks.
 *
 * WHAT IT DOES NOT: Unicode beyond Latin-1, images, or wrapping cleverness
 * beyond a greedy break. The rupee sign is the one character that matters here
 * and it is outside Latin-1, so `money()` writes "Rs." rather than emitting a
 * byte the reader would render as garbage. A wrong glyph on a price is worse
 * than a plain one.
 */

type Font = "Helvetica" | "Helvetica-Bold";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;

/** Approximate Helvetica advance widths, per 1000 units, for the ASCII range. */
const WIDTHS: Record<string, number> = {};
{
  const base =
    "                                " + // 0-31 unused
    " !\"#$%&'()*+,-./0123456789:;<=>?@" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
    "abcdefghijklmnopqrstuvwxyz{|}~";
  // Helvetica metrics, rounded. Precise enough for right-alignment and wrapping;
  // this is a quotation, not typesetting.
  const w: [string, number][] = [
    [" ", 278], ["!", 278], ['"', 355], ["#", 556], ["$", 556], ["%", 889], ["&", 667],
    ["'", 191], ["(", 333], [")", 333], ["*", 389], ["+", 584], [",", 278], ["-", 333],
    [".", 278], ["/", 278], [":", 278], [";", 278], ["<", 584], ["=", 584], [">", 584],
    ["?", 556], ["@", 1015], ["[", 278], ["\\", 278], ["]", 278], ["^", 469], ["_", 556],
    ["`", 333], ["{", 334], ["|", 260], ["}", 334], ["~", 584],
  ];
  for (const [c, v] of w) WIDTHS[c] = v;
  for (const c of "0123456789") WIDTHS[c] = 556;
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") WIDTHS[c] = 667;
  for (const c of "abcdefghijklmnopqrstuvwxyz") WIDTHS[c] = 556;
  for (const c of "ijlt") WIDTHS[c] = 222;
  for (const c of "fr") WIDTHS[c] = 333;
  for (const c of "mw") WIDTHS[c] = 833;
  void base;
}

export function textWidth(s: string, size: number, bold = false) {
  let total = 0;
  for (const ch of s) total += WIDTHS[ch] ?? 556;
  // Bold Helvetica runs a little wider; a flat factor is close enough to keep
  // right-aligned columns from colliding.
  return (total / 1000) * size * (bold ? 1.04 : 1);
}

/** Latin-1 only, with the PDF string metacharacters escaped. */
function esc(s: string) {
  return s
    .replace(/[\\()]/g, (m) => `\\${m}`)
    // Anything outside Latin-1 becomes a question mark rather than a broken
    // byte sequence — a visible gap beats a mojibake price.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

type Op = string;

export class Pdf {
  private pages: Op[][] = [];
  private ops: Op[] = [];
  private y = A4.h - MARGIN;

  constructor() {
    this.pages.push(this.ops);
  }

  get cursor() {
    return this.y;
  }

  set cursor(v: number) {
    this.y = v;
  }

  /** Start a fresh page when the next block would not fit. */
  ensure(space: number) {
    if (this.y - space < MARGIN) this.newPage();
  }

  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = A4.h - MARGIN;
  }

  text(
    s: string,
    opts: {
      x?: number;
      size?: number;
      font?: Font;
      grey?: number;
      align?: "left" | "right";
      rightAt?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font ?? "Helvetica";
    const grey = opts.grey ?? 0;
    let x = opts.x ?? MARGIN;
    if (opts.align === "right") {
      x = (opts.rightAt ?? A4.w - MARGIN) - textWidth(s, size, font === "Helvetica-Bold");
    }
    const f = font === "Helvetica-Bold" ? "/F2" : "/F1";
    this.ops.push(
      `${grey} g BT ${f} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm (${esc(s)}) Tj ET`,
    );
  }

  /** Text plus a line advance. */
  line(s: string, opts: Parameters<Pdf["text"]>[1] & { leading?: number } = {}) {
    this.ensure((opts.leading ?? (opts.size ?? 10) * 1.45) + 4);
    this.text(s, opts);
    this.y -= opts.leading ?? (opts.size ?? 10) * 1.45;
  }

  /** Greedy word wrap inside a width. Returns the number of lines drawn. */
  paragraph(
    s: string,
    opts: { x?: number; width?: number; size?: number; grey?: number; leading?: number } = {},
  ) {
    const size = opts.size ?? 9;
    const width = opts.width ?? A4.w - MARGIN * 2;
    const words = s.split(/\s+/).filter(Boolean);
    let current = "";
    let drawn = 0;

    const flush = () => {
      if (!current) return;
      this.line(current, { x: opts.x, size, grey: opts.grey ?? 0.35, leading: opts.leading ?? size * 1.4 });
      drawn++;
      current = "";
    };

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size) > width && current) flush();
      else current = candidate;
      if (!current) current = word;
    }
    flush();
    return drawn;
  }

  rule(grey = 0.85) {
    this.ensure(10);
    this.ops.push(
      `${grey} G 0.6 w ${MARGIN} ${this.y.toFixed(2)} m ${(A4.w - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`,
    );
    this.y -= 10;
  }

  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
    this.ops.push(
      `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  gap(n: number) {
    this.y -= n;
  }

  /** Serialise to a real PDF byte string. */
  build(title: string): Buffer {
    const objects: string[] = [];
    const pageCount = this.pages.length;

    // 1 catalog, 2 pages, 3..3+n-1 page objects, then content streams, then fonts.
    const firstPageObj = 3;
    const firstContentObj = firstPageObj + pageCount;
    const fontObj = firstContentObj + pageCount;

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] =
      `<< /Type /Pages /Count ${pageCount} /Kids [${this.pages
        .map((_, i) => `${firstPageObj + i} 0 R`)
        .join(" ")}] >>`;

    this.pages.forEach((_, i) => {
      objects[firstPageObj + i] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R /F2 ${fontObj + 1} 0 R >> >> ` +
        `/Contents ${firstContentObj + i} 0 R >>`;
    });

    this.pages.forEach((ops, i) => {
      const stream = ops.join("\n");
      objects[firstContentObj + i] =
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    });

    objects[fontObj] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[fontObj + 1] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    const infoObj = fontObj + 2;
    objects[infoObj] = `<< /Title (${esc(title)}) /Producer (Rachna AI) >>`;

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let i = 1; i < objects.length; i++) {
      if (!objects[i]) continue;
      offsets[i] = Buffer.byteLength(out, "latin1");
      out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefAt = Buffer.byteLength(out, "latin1");
    const max = objects.length;
    out += `xref\n0 ${max}\n0000000000 65535 f \n`;
    for (let i = 1; i < max; i++) {
      out += objects[i]
        ? `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
        : `0000000000 65535 f \n`;
    }
    out += `trailer\n<< /Size ${max} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;

    return Buffer.from(out, "latin1");
  }
}

export const PAGE = A4;
export const PAGE_MARGIN = MARGIN;

/** "Rs." not the rupee sign: U+20B9 is outside WinAnsi and would not render. */
export const money = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
