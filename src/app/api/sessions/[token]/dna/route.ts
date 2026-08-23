import { NextResponse } from "next/server";
import { getDesignSignals, recordDesignSignals } from "@/server/sessions";
import { deriveDNA, type DesignSignal } from "@/lib/dna";
import { SHADES } from "@/lib/catalog";
import { providerStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Design DNA.
 *
 * The profile is DERIVED SERVER-SIDE, always. The client posts what happened —
 * "this scheme was saved", "this one was discarded" — and never posts a
 * conclusion. That separation is what lets the derivation rules be improved
 * later and every stored profile recomputed from its own evidence.
 *
 * Shade names are resolved here rather than sent by the client, so the profile
 * always shows the dealer's real catalogue names.
 */
const SHADE_NAMES = new Map(SHADES.map((s) => [s.hex.toLowerCase(), s.name]));

const KINDS = new Set([
  "viewed",
  "previewed",
  "saved",
  "chosen",
  "discarded",
  "shade-swapped",
  "brief",
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accept a batch of signals, re-derive, return the profile. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const raw = Array.isArray(body.signals) ? body.signals : [];
  // A batch, because the customer app buffers taps rather than writing on every
  // one. Twenty is far above what a real burst produces and well below anything
  // that would make a single write expensive.
  if (!raw.length || raw.length > 20) {
    return NextResponse.json({ error: "invalid_signals" }, { status: 400 });
  }

  const clean: DesignSignal[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const kind = String(r.kind ?? "");
    if (!KINDS.has(kind)) continue;

    const hexes = Array.isArray(r.hexes)
      ? r.hexes.filter((h): h is string => typeof h === "string" && HEX.test(h)).slice(0, 4)
      : undefined;

    const str = (v: unknown) =>
      typeof v === "string" && v.length && v.length < 40 ? v : undefined;

    clean.push({
      kind: kind as DesignSignal["kind"],
      // Timestamped on the server. A client clock that is wrong — or set
      // deliberately — must not be able to reorder someone's preference history.
      at: new Date().toISOString(),
      hexes,
      finish: str(r.finish),
      budget: str(r.budget),
      roomType: str(r.roomType),
      surface: str(r.surface),
      mood: str(r.mood),
      approach: str(r.approach),
      note: typeof r.note === "string" ? r.note.slice(0, 120) : undefined,
    });
  }

  if (!clean.length) return NextResponse.json({ error: "invalid_signals" }, { status: 400 });

  const result = await recordDesignSignals(token, clean, (signals) =>
    deriveDNA(signals as DesignSignal[], SHADE_NAMES) as unknown as Record<string, unknown>,
  );
  if (!result.ok) return fail(result.error);

  return NextResponse.json({
    dna: result.profile,
    disclosure: providerStatus().preference.disclosure,
  });
}

/** The current profile, re-derived from stored evidence on every read. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const signals = (await getDesignSignals(token)) as DesignSignal[];
  return NextResponse.json({
    dna: deriveDNA(signals, SHADE_NAMES),
    disclosure: providerStatus().preference.disclosure,
  });
}

function fail(error: string) {
  const status = error === "expired" ? 410 : error === "closed" ? 409 : 404;
  return NextResponse.json({ error }, { status });
}
