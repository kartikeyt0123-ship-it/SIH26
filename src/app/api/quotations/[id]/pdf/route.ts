import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { currentDealerId } from "@/server/auth";
import { renderQuotation } from "@/server/quotation-pdf";
import type { QuoteLine } from "@/lib/quote";
import type { SelectedScheme } from "@/lib/session-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The quotation as a PDF.
 *
 * Rendered from the STORED quotation row, never recomputed. A document the
 * customer has already been sent must not change because stock moved or a price
 * was edited afterwards — the PDF is a record of what was quoted, and
 * regenerating it from current data would quietly rewrite history.
 *
 * Scoped to the signed-in dealer: a quotation id is a short string and must not
 * be a way to read another shop's pricing.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const db = await getDb();
  const quote = await db.query.quotations.findFirst({ where: eq(t.quotations.id, id) });
  if (!quote || quote.dealerId !== dealerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [dealer, session, project] = await Promise.all([
    db.query.dealers.findFirst({ where: eq(t.dealers.id, dealerId) }),
    db.query.customerSessions.findFirst({ where: eq(t.customerSessions.id, quote.sessionId) }),
    db.query.projects.findFirst({ where: eq(t.projects.id, quote.projectId) }),
  ]);

  const [req0, chosen] = await Promise.all([
    db.query.requirements.findFirst({ where: eq(t.requirements.projectId, quote.projectId) }),
    db.query.savedDesigns.findFirst({ where: eq(t.savedDesigns.projectId, quote.projectId) }),
  ]);

  const spec = (req0?.parsedSpec ?? {}) as Record<string, string>;
  const scheme = chosen?.scheme as unknown as SelectedScheme | undefined;

  const pdf = renderQuotation({
    quotationId: quote.id,
    createdAt: quote.createdAt,
    dealer: {
      name: dealer?.name ?? "Rachna dealer",
      owner: dealer?.owner ?? "",
      city: dealer?.city ?? "",
      phone: dealer?.phone ? `+91 ${dealer.phone}` : null,
      pincode: dealer?.pincode ?? null,
    },
    customer: {
      name: session?.customerName ?? "Customer",
      phone: session?.phone ?? null,
    },
    project: { roomType: spec.roomType, surface: spec.surface },
    areas: quote.areas as unknown as Record<string, number>,
    lines: quote.lines as unknown as QuoteLine[],
    subtotal: quote.subtotal,
    discountPct: quote.discountPct,
    total: quote.total,
    scheme: scheme
      ? { title: scheme.title, shades: scheme.shades as unknown as Record<string, { name: string; hex: string }> }
      : undefined,
    notes: [
      "Materials only. Labour, scaffolding and taxes are not included.",
      "Quantities include an 8% wastage allowance and are rounded up to whole packs.",
      "Coverage figures are the manufacturer's, on a primed surface. A rough or very porous wall will take more.",
    ],
  });

  void project;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline, so tapping the link on a phone opens the reader rather than
      // dropping a file the dealer then has to go and find.
      "Content-Disposition": `inline; filename="rachna-quotation-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
