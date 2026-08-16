import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { PRODUCT_LINES } from "@/lib/catalog";

/**
 * Tally import.
 *
 * Almost every dealer already runs Tally, and none of them will retype three
 * hundred stock lines into a new system. So the import has to accept what Tally
 * actually produces, not a format we wish it produced:
 *
 *   - Stock Summary exported as CSV or Excel-as-CSV
 *   - Native Tally XML export (`<STOCKITEM>` records)
 *
 * Both are messy in the same ways: quantities carry their unit inline
 * ("240 Ltr"), rates carry a denominator ("112.00/Ltr"), numbers use Indian
 * digit grouping, and item names never match a catalogue exactly.
 *
 * Nothing is written until the dealer confirms. The parse produces a preview
 * with a proposed match per row and a confidence, and the dealer can see what
 * would change before it changes. An import that silently overwrites a stock
 * position is worse than no import at all.
 */

export type TallyRow = {
  raw: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
};

export type MatchedRow = TallyRow & {
  productId: string | null;
  productLabel: string | null;
  confidence: "exact" | "likely" | "weak" | "none";
  action: "update" | "create-pending" | "skip";
  currentLitres?: number;
};

/* ------------------------------- parsing -------------------------------- */

/** "1,20,240.50 Ltr" → { value: 120240.5, unit: "Ltr" } */
function parseQuantity(input: string): { value: number | null; unit: string | null } {
  if (!input) return { value: null, unit: null };
  const cleaned = input.replace(/,/g, "").trim();
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)\s*([A-Za-z.]+)?/);
  if (!m) return { value: null, unit: null };
  return { value: Number(m[1]), unit: m[2]?.replace(/\.$/, "") ?? null };
}

/** "112.00/Ltr" or "₹ 1,120.00" → 112 / 1120 */
function parseRate(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[₹,\s]/g, "").split("/")[0];
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Split a CSV line, honouring quoted fields — Tally quotes names with commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if ((c === "," || c === "\t") && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Repair Indian digit grouping that Tally left unquoted.
 *
 * Tally writes quantities as "1,20,200 Ltr". When the field is not quoted, a
 * comma-split shreds it into ["1", "20", "200 Ltr"] and the row silently reads
 * as a stock of 1 — a wrong number that looks perfectly plausible in a table,
 * which is the worst kind. If a row produced more cells than the header has
 * columns, glue neighbouring fragments back together: a fragment that is
 * exactly 2 or 3 digits, following a numeric cell, is a digit group, not a
 * column.
 */
function rejoinGroupedNumbers(cells: string[], headerLen: number): string[] {
  if (cells.length <= headerLen) return cells;

  const out: string[] = [];
  for (const cell of cells) {
    const prev = out[out.length - 1];
    const isGroup = /^\d{2,3}(\s*[A-Za-z.]+)?$/.test(cell);
    const prevIsNumeric = prev !== undefined && /^\d[\d,]*$/.test(prev.trim());
    if (isGroup && prevIsNumeric && out.length && cells.length > headerLen) {
      out[out.length - 1] = `${prev},${cell}`;
    } else {
      out.push(cell);
    }
    if (out.length >= headerLen && cells.indexOf(cell) === cells.length - 1) break;
  }
  return out;
}

export function parseTallyCsv(text: string): TallyRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];

  // Find the header row. Tally puts the company name and report title above it,
  // so the first line is almost never the header.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const l = lines[i].toLowerCase();
    if (/particular|item\s*name|name of item|stock item/.test(l)) {
      headerIdx = i;
      break;
    }
  }

  const header = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const find = (...needles: string[]) =>
    header.findIndex((h) => needles.some((n) => h.includes(n)));

  const nameCol = Math.max(0, find("particular", "item name", "name of item", "stock item", "item"));
  const qtyCol = find("closing qty", "closing balance", "quantity", "qty", "closing");
  const rateCol = find("rate", "closing rate", "price");

  const rows: TallyRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = rejoinGroupedNumbers(splitCsvLine(lines[i]), header.length);
    const name = (cells[nameCol] ?? "").trim();
    if (!name) continue;
    // Tally repeats "Grand Total" / "Opening" summary rows at the bottom.
    if (/^(grand\s*total|total|opening|closing)\b/i.test(name)) continue;

    const q = parseQuantity(qtyCol >= 0 ? cells[qtyCol] ?? "" : "");
    rows.push({
      raw: lines[i],
      name,
      quantity: q.value,
      unit: q.unit,
      rate: rateCol >= 0 ? parseRate(cells[rateCol] ?? "") : null,
    });
  }
  return rows;
}

/**
 * Native Tally XML. Parsed with regex rather than an XML library on purpose:
 * Tally's exports are frequently not well-formed (unescaped `&`, stray control
 * characters from item names typed on a counter machine), and a strict parser
 * rejects the whole file over one bad row. Tolerance matters more than rigour
 * here — a dealer will not go and hand-fix his export.
 */
export function parseTallyXml(text: string): TallyRow[] {
  const rows: TallyRow[] = [];
  const items = text.match(/<STOCKITEM[\s\S]*?<\/STOCKITEM>/gi) ?? [];

  for (const item of items) {
    const name =
      item.match(/<STOCKITEM[^>]*NAME\s*=\s*"([^"]+)"/i)?.[1] ??
      item.match(/<NAME>([\s\S]*?)<\/NAME>/i)?.[1] ??
      "";
    if (!name.trim()) continue;

    const balance = item.match(/<CLOSINGBALANCE>([\s\S]*?)<\/CLOSINGBALANCE>/i)?.[1] ?? "";
    const rate = item.match(/<CLOSINGRATE>([\s\S]*?)<\/CLOSINGRATE>/i)?.[1] ?? "";
    const q = parseQuantity(balance);

    rows.push({
      raw: name,
      name: name.replace(/&amp;/g, "&").trim(),
      quantity: q.value,
      unit: q.unit,
      rate: parseRate(rate),
    });
  }
  return rows;
}

export function parseTally(text: string, filename: string): TallyRow[] {
  const looksXml = /<\s*ENVELOPE|<\s*STOCKITEM/i.test(text.slice(0, 4000));
  if (looksXml || /\.xml$/i.test(filename)) return parseTallyXml(text);
  return parseTallyCsv(text);
}

/* ------------------------------- matching -------------------------------- */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltr|litre|liters?|kg|pcs|nos|no|emulsion|paint)\b/g, " ")
    .trim();

const tokens = (s: string) => new Set(normalise(s).split(/\s+/).filter((w) => w.length > 2));

/**
 * Token-overlap match against the catalogue.
 *
 * Deliberately conservative: a weak match is offered as a suggestion the dealer
 * must accept, never applied silently. Mapping "Apex Ultima 20L" onto the wrong
 * product would corrupt his availability and, through it, what customers are
 * shown — the one thing that must not go wrong quietly.
 */
export function matchRow(row: TallyRow) {
  const rowTokens = tokens(row.name);
  if (!rowTokens.size) return { productId: null, label: null, confidence: "none" as const };

  let best: { id: string; label: string; score: number } | null = null;

  for (const p of PRODUCT_LINES) {
    const label = `${p.brand} ${p.name}`;
    const candidate = tokens(label);
    let hits = 0;
    rowTokens.forEach((tk) => {
      if (candidate.has(tk)) hits++;
    });
    if (!hits) continue;
    const score = (2 * hits) / (rowTokens.size + candidate.size);
    if (!best || score > best.score) best = { id: p.id, label, score };
  }

  if (!best) return { productId: null, label: null, confidence: "none" as const };
  const confidence =
    best.score >= 0.8 ? "exact" : best.score >= 0.45 ? "likely" : best.score >= 0.25 ? "weak" : "none";
  return {
    productId: confidence === "none" ? null : best.id,
    label: confidence === "none" ? null : best.label,
    confidence,
  } as const;
}

/* -------------------------------- preview -------------------------------- */

export async function previewImport(dealerId: string, rows: TallyRow[]): Promise<MatchedRow[]> {
  const db = await getDb();
  const existing = await db
    .select({ productId: t.inventory.productId, litres: t.inventory.litres })
    .from(t.inventory)
    .where(eq(t.inventory.dealerId, dealerId));
  const byProduct = new Map(existing.map((e) => [e.productId, e.litres]));

  return rows.map((r) => {
    const m = matchRow(r);
    const matched = m.productId !== null;
    return {
      ...r,
      productId: m.productId,
      productLabel: m.label,
      confidence: m.confidence,
      action: !matched || r.quantity === null ? "skip" : "update",
      currentLitres: m.productId ? byProduct.get(m.productId) : undefined,
    };
  });
}

/* --------------------------------- commit -------------------------------- */

export async function commitImport(
  dealerId: string,
  rows: { productId: string; quantity: number; rate?: number | null }[],
) {
  const db = await getDb();
  let updated = 0;
  let created = 0;

  for (const r of rows) {
    const existing = await db.query.inventory.findFirst({
      where: and(eq(t.inventory.dealerId, dealerId), eq(t.inventory.productId, r.productId)),
    });

    if (existing) {
      await db
        .update(t.inventory)
        .set({
          litres: r.quantity,
          // Only overwrite price when Tally actually carried one. A blank rate
          // column must not wipe a price the dealer set by hand.
          ...(r.rate ? { sellingPerLitre: Math.round(r.rate) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(t.inventory.id, existing.id));
      updated++;
    } else {
      const line = PRODUCT_LINES.find((p) => p.id === r.productId);
      if (!line) continue;
      await db.insert(t.inventory).values({
        id: `inv_${r.productId}`,
        dealerId,
        productId: r.productId,
        litres: r.quantity,
        reorderLevel: Math.max(1, Math.round(r.quantity * 0.25)),
        // ASSUMPTION: a newly imported line has no sales history yet, so offtake
        // starts at zero and the forecast stays silent until real dispatches
        // accumulate. Inventing a rate here would produce confident nonsense.
        weeklyOfftake: 0,
        leadTimeDays: 7,
        sellingPerLitre: Math.round(r.rate ?? line.pricePerLitre),
      });
      created++;
    }
  }

  return { updated, created };
}
