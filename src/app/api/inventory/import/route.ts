import { NextResponse } from "next/server";
import { DEALER_ID } from "@/db/seed";
import { commitImport, parseTally, previewImport } from "@/server/tally";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tally import — two phases, always.
 *
 * POST multipart with a file  → parse and return a preview. Writes nothing.
 * POST JSON with rows         → commit the rows the dealer accepted.
 *
 * The split is the point: the dealer sees every proposed match, with its
 * confidence and the value it would replace, before a single row is written.
 */
export async function POST(req: Request) {
  const dealerId = new URL(req.url).searchParams.get("dealerId") ?? DEALER_ID;
  const contentType = req.headers.get("content-type") ?? "";

  /* ---------------------------- phase 1: dry run --------------------------- */
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "too_large" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseTally(text, file.name);
    if (!rows.length) {
      return NextResponse.json(
        {
          error: "unreadable",
          message:
            "No stock rows found. Export Stock Summary from Tally as CSV, or use a native XML export.",
        },
        { status: 400 },
      );
    }

    const preview = await previewImport(dealerId, rows);
    return NextResponse.json({
      filename: file.name,
      format: /<\s*STOCKITEM/i.test(text.slice(0, 4000)) ? "Tally XML" : "CSV",
      total: preview.length,
      matched: preview.filter((r) => r.action === "update").length,
      skipped: preview.filter((r) => r.action === "skip").length,
      rows: preview,
    });
  }

  /* ---------------------------- phase 2: commit ---------------------------- */
  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const clean = rows
    .filter(
      (r: { productId?: string; quantity?: number }) =>
        typeof r.productId === "string" && typeof r.quantity === "number" && r.quantity >= 0,
    )
    .map((r: { productId: string; quantity: number; rate?: number | null }) => ({
      productId: r.productId,
      quantity: r.quantity,
      rate: r.rate ?? null,
    }));

  if (!clean.length) return NextResponse.json({ error: "no_rows" }, { status: 400 });

  const result = await commitImport(dealerId, clean);
  return NextResponse.json({ ok: true, ...result });
}
