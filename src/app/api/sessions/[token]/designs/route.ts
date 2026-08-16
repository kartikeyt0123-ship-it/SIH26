import { NextResponse } from "next/server";
import { chooseDesign, getSessionByToken, removeDesign, saveDesign } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** §17 — the customer may shortlist several designs before choosing one. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.schemeId || !body.scheme) {
    return NextResponse.json({ error: "missing_scheme" }, { status: 400 });
  }
  const r = await saveDesign(token, {
    schemeId: String(body.schemeId),
    label: body.label ? String(body.label) : undefined,
    scheme: body.scheme,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ session: await getSessionByToken(token) });
}

/** Mark one of the shortlisted designs as the customer's choice. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.designId) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const r = await chooseDesign(token, String(body.designId));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ session: await getSessionByToken(token) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { token } = await params;
  const designId = new URL(req.url).searchParams.get("id");
  if (!designId) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const r = await removeDesign(token, designId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ session: await getSessionByToken(token) });
}
