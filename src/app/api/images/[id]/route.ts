import { getImage } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a project photograph.
 *
 * These are pictures of the inside of someone's home, so they are served
 * through a handler rather than dropped in `public/`, and they are marked
 * private so no shared cache holds a copy. The image id is a UUID, which is the
 * access control today; when the session token is threaded through the client
 * this handler is where the ownership check belongs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await getImage(id);
  if (!img) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      // The id is a UUID and the bytes behind it never change, so the browser
      // can keep it forever. Without this the dealer's queue re-downloads every
      // customer photograph on each poll.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": String(img.data.byteLength),
    },
  });
}
