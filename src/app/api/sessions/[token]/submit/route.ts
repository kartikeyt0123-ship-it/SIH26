import { NextResponse } from "next/server";
import { getSessionByToken, submitProject } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * §20 — the customer sends the design to the dealer.
 *
 * The project and the session both move to SUBMITTED, which makes every
 * subsequent customer write fail with 409 rather than silently editing a design
 * the dealer has already started quoting. The link still resolves; it shows the
 * confirmation. Nothing here tries to close the customer's browser tab — a page
 * cannot close a tab it did not open, and pretending otherwise just produces a
 * button that does nothing.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const r = await submitProject(token, body.note ? String(body.note) : undefined);
  if (!r.ok) {
    const status = r.error === "expired" ? 410 : r.error === "closed" ? 409 : 404;
    return NextResponse.json({ error: r.error }, { status });
  }

  return NextResponse.json({ session: await getSessionByToken(token) });
}
