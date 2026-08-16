import { NextResponse } from "next/server";
import { addImage, getSessionByToken, removeImage } from "@/server/sessions";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PROJECT_IMAGES } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Customer: upload architecture photographs (§11).
 *
 * Validation happens here rather than only in the browser — the client-side
 * checks are a courtesy to the customer, not a security boundary.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });

  const already = session.project?.images.length ?? 0;
  if (already >= MAX_PROJECT_IMAGES) {
    return NextResponse.json(
      { error: "too_many", message: `Up to ${MAX_PROJECT_IMAGES} photographs.` },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const room = MAX_PROJECT_IMAGES - already;
  const uploaded: { id: string; url: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const file of files.slice(0, room)) {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      rejected.push({ name: file.name, reason: "That file is not an image we can read." });
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({ name: file.name, reason: "That photograph is too large." });
      continue;
    }
    const data = Buffer.from(await file.arrayBuffer());
    const r = await addImage(token, { data, mimeType: file.type, bytes: file.size });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    uploaded.push({ id: r.id, url: r.url });
  }

  return NextResponse.json({
    uploaded,
    rejected,
    session: await getSessionByToken(token),
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { token } = await params;
  const imageId = new URL(req.url).searchParams.get("id");
  if (!imageId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const r = await removeImage(token, imageId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json({ session: await getSessionByToken(token) });
}
