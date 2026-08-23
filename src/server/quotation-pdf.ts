/**
 * The quotation document.
 *
 * Everything on this page has to be defensible at a counter, because that is
 * where it gets read. So each line carries the arithmetic that produced it —
 * area, coats, coverage, wastage, packs, rate — rather than a bare amount. A
 * customer who can check the sum does not have to trust it, and a dealer who is
 * asked "why this much paint?" has the answer printed in front of him.
 */

import { Pdf, PAGE, PAGE_MARGIN, money, textWidth } from "./pdf";
import type { QuoteLine } from "@/lib/quote";

export type QuotationDoc = {
  quotationId: string;
  createdAt: Date;
  dealer: { name: string; owner: string; city: string; phone: string | null; pincode: string | null };
  customer: { name: string; phone: string | null };
  project: { roomType?: string; surface?: string };
  areas: Record<string, number>;
  lines: QuoteLine[];
  subtotal: number;
  discountPct: number;
  total: number;
  scheme?: { title?: string; shades?: Record<string, { name: string; hex: string }> };
  notes: string[];
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function renderQuotation(doc: QuotationDoc): Buffer {
  const pdf = new Pdf();
  const right = PAGE.w - PAGE_MARGIN;

  /* ------------------------------- header -------------------------------- */
  pdf.rect(0, PAGE.h - 96, PAGE.w, 96, [0.05, 0.06, 0.07]);
  pdf.cursor = PAGE.h - 44;
  pdf.text("RACHNA AI", { size: 16, font: "Helvetica-Bold", grey: 1 });
  pdf.text("QUOTATION", { size: 16, font: "Helvetica-Bold", grey: 1, align: "right", rightAt: right });
  pdf.cursor = PAGE.h - 62;
  pdf.text(doc.dealer.name, { size: 9.5, grey: 0.75 });
  pdf.text(`No. ${doc.quotationId.slice(0, 18)}`, { size: 8.5, grey: 0.6, align: "right", rightAt: right });
  pdf.cursor = PAGE.h - 76;
  pdf.text(
    [doc.dealer.city, doc.dealer.pincode, doc.dealer.phone].filter(Boolean).join(" · "),
    { size: 8.5, grey: 0.6 },
  );
  pdf.text(
    doc.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    { size: 8.5, grey: 0.6, align: "right", rightAt: right },
  );

  pdf.cursor = PAGE.h - 128;

  /* ------------------------------ recipient ------------------------------ */
  pdf.line("PREPARED FOR", { size: 7.5, font: "Helvetica-Bold", grey: 0.45, leading: 13 });
  pdf.line(doc.customer.name, { size: 13, font: "Helvetica-Bold", leading: 15 });
  if (doc.customer.phone) pdf.line(doc.customer.phone, { size: 9.5, grey: 0.4, leading: 14 });
  const scope = [doc.project.roomType, doc.project.surface === "exterior" ? "exterior" : "interior"]
    .filter(Boolean)
    .join(" · ");
  if (scope) pdf.line(scope, { size: 9.5, grey: 0.4, leading: 16 });

  /* ------------------------------- scheme -------------------------------- */
  if (doc.scheme?.shades) {
    pdf.gap(4);
    pdf.line(doc.scheme.title ?? "Selected scheme", { size: 10.5, font: "Helvetica-Bold", leading: 16 });
    const entries = Object.entries(doc.scheme.shades);
    let x = PAGE_MARGIN;
    const swatchY = pdf.cursor - 26;
    for (const [role, s] of entries) {
      pdf.rect(x, swatchY, 54, 26, hexToRgb(s.hex));
      pdf.cursor = swatchY - 11;
      pdf.text(role.toUpperCase(), { x, size: 6.5, grey: 0.5 });
      pdf.cursor = swatchY - 20;
      pdf.text(s.name.slice(0, 16), { x, size: 7.5, grey: 0.25 });
      x += 62;
    }
    pdf.cursor = swatchY - 34;
  }

  /* -------------------------------- areas -------------------------------- */
  pdf.gap(6);
  pdf.rule();
  const areaBits = [
    ["Net wall", doc.areas.netWallSqft],
    ["Feature wall", doc.areas.featureWallSqft],
    ["Ceiling", doc.areas.ceilingSqft],
    ["Trim", doc.areas.trimSqft],
  ].filter(([, v]) => Number(v) > 0);

  if (areaBits.length) {
    pdf.line("MEASURED AREAS (from the customer's own measurements)", {
      size: 7.5,
      font: "Helvetica-Bold",
      grey: 0.45,
      leading: 14,
    });
    pdf.line(areaBits.map(([k, v]) => `${k} ${v} sq ft`).join("     "), {
      size: 9,
      grey: 0.3,
      leading: 18,
    });
  }

  /* -------------------------------- lines -------------------------------- */
  pdf.rule();
  pdf.line("ITEMS", { size: 7.5, font: "Helvetica-Bold", grey: 0.45, leading: 15 });

  for (const l of doc.lines) {
    // A line plus its working needs roughly 46pt; breaking between the two
    // would orphan the arithmetic from the amount it explains.
    pdf.ensure(52);
    pdf.text(`${l.role} — ${l.brand} ${l.product}`, { size: 10, font: "Helvetica-Bold" });
    pdf.text(money(l.amount), { size: 10, font: "Helvetica-Bold", align: "right", rightAt: right });
    pdf.gap(13);

    if (l.shadeName) {
      pdf.text(`${l.shadeName}`, { size: 8.5, grey: 0.4 });
      if (l.shadeHex) pdf.rect(PAGE_MARGIN + textWidth(l.shadeName, 8.5) + 8, pdf.cursor - 1, 16, 8, hexToRgb(l.shadeHex));
      pdf.gap(12);
    }

    pdf.paragraph(l.working, { size: 8, grey: 0.45, leading: 11 });
    if (l.why) pdf.paragraph(l.why, { size: 8, grey: 0.45, leading: 11 });
    if (l.required) {
      pdf.line("Required for this job, not an optional extra.", { size: 7.5, grey: 0.55, leading: 12 });
    }
    pdf.gap(6);
  }

  /* -------------------------------- totals ------------------------------- */
  pdf.ensure(90);
  pdf.rule();
  pdf.text("Subtotal", { size: 10, grey: 0.3 });
  pdf.text(money(doc.subtotal), { size: 10, align: "right", rightAt: right });
  pdf.gap(16);

  if (doc.discountPct > 0) {
    pdf.text(`Discount ${doc.discountPct}%`, { size: 10, grey: 0.3 });
    pdf.text(`- ${money(doc.subtotal - doc.total)}`, { size: 10, align: "right", rightAt: right });
    pdf.gap(16);
  }

  pdf.rect(PAGE_MARGIN, pdf.cursor - 8, PAGE.w - PAGE_MARGIN * 2, 30, [0.96, 0.95, 0.93]);
  pdf.gap(-6);
  pdf.text("TOTAL (materials only)", { x: PAGE_MARGIN + 10, size: 11, font: "Helvetica-Bold" });
  pdf.text(money(doc.total), {
    size: 13,
    font: "Helvetica-Bold",
    align: "right",
    rightAt: right - 10,
  });
  pdf.gap(30);

  /* -------------------------------- notes -------------------------------- */
  pdf.gap(8);
  pdf.line("NOTES", { size: 7.5, font: "Helvetica-Bold", grey: 0.45, leading: 13 });
  for (const n of doc.notes) pdf.paragraph(`- ${n}`, { size: 8, grey: 0.45, leading: 11 });
  pdf.paragraph(
    "Quantities are computed from the measurements the customer entered, not from photographs. Prices are this dealer's own selling rates and are valid subject to stock at the time of order.",
    { size: 8, grey: 0.45, leading: 11 },
  );

  pdf.gap(10);
  pdf.paragraph(
    `Prepared by ${doc.dealer.owner} for ${doc.dealer.name}. Generated by Rachna AI.`,
    { size: 7.5, grey: 0.55, leading: 10 },
  );

  return pdf.build(`Quotation ${doc.quotationId.slice(0, 12)} - ${doc.customer.name}`);
}
