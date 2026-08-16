import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { SESSION_DURATION_HOURS } from "@/lib/config";
import * as storage from "./storage";

/**
 * Session and project service — the only module that talks to the database.
 *
 * Route handlers stay thin on purpose: everything that decides whether a
 * customer may see or change something lives here, in one file that can be
 * read top to bottom.
 */

/* -------------------------------- tokens -------------------------------- */

// No O/0, no I/1, no L — a dealer sometimes reads this out across a counter.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 11;

/**
 * §27 — unique and non-guessable.
 *
 * 31^11 ≈ 2.5 × 10^16, drawn from the CSPRNG rather than Math.random. Guessing
 * a live token is not a practical attack, which matters because the token is
 * the only credential protecting a customer's photographs.
 */
function generateToken() {
  const bytes = randomBytes(TOKEN_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < TOKEN_LENGTH; i++) {
    // Reject values in the ragged tail so the distribution stays uniform.
    const v = bytes[i % bytes.length];
    if (v >= 248) continue;
    out += ALPHABET[v % ALPHABET.length];
  }
  return out;
}

/* --------------------------------- types -------------------------------- */

// The wire shapes live in lib/session-types so a client component can import
// them without pulling PGlite and the filesystem into the browser bundle.
export type { ProjectDTO, SessionDTO } from "@/lib/session-types";
import type { ProjectDTO, SessionDTO } from "@/lib/session-types";

const hoursBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;

/* -------------------------------- create -------------------------------- */

export async function createSession(input: {
  dealerId: string;
  customerName: string;
  phone?: string;
  validityHours?: number;
}): Promise<SessionDTO> {
  const db = await getDb();
  const hours = input.validityHours ?? SESSION_DURATION_HOURS;

  // Retry on the astronomically unlikely collision rather than handing two
  // customers the same session.
  let token = generateToken();
  for (let i = 0; i < 5; i++) {
    const clash = await db.query.customerSessions.findFirst({
      where: eq(t.customerSessions.token, token),
    });
    if (!clash) break;
    token = generateToken();
  }

  const sessionId = `cs_${randomUUID()}`;
  const now = new Date();

  await db.insert(t.customerSessions).values({
    id: sessionId,
    dealerId: input.dealerId,
    token,
    customerName: input.customerName.trim() || "Walk-in customer",
    phone: input.phone?.trim() || null,
    status: "ACTIVE",
    // Scoped deliberately: a session may read the catalogue and write its own
    // project. It can do nothing else, and it can see no other project.
    permissions: ["project:read", "project:write", "catalogue:read"],
    createdAt: now,
    expiresAt: new Date(now.getTime() + hours * 3_600_000),
  });

  // One project per session for now. The schema allows more.
  await db.insert(t.projects).values({
    id: `p_${randomUUID()}`,
    dealerId: input.dealerId,
    sessionId,
    status: "DRAFT",
    step: 0,
  });

  return (await getSessionById(sessionId))!;
}

/* --------------------------------- read --------------------------------- */

async function hydrate(row: typeof t.customerSessions.$inferSelect): Promise<SessionDTO> {
  const db = await getDb();
  const now = new Date();
  const expired = now > row.expiresAt && row.status !== "SUBMITTED";

  // Expiry is enforced here, not by a cron. A session that has run out is
  // dead the next time anyone asks about it, whether or not a job has run.
  if (expired && row.status !== "EXPIRED") {
    await db
      .update(t.customerSessions)
      .set({ status: "EXPIRED" })
      .where(eq(t.customerSessions.id, row.id));
    row = { ...row, status: "EXPIRED" };
  }

  const project = await db.query.projects.findFirst({
    where: eq(t.projects.sessionId, row.id),
  });

  return {
    id: row.id,
    token: row.token,
    dealerId: row.dealerId,
    customerName: row.customerName,
    phone: row.phone,
    status: row.status,
    opens: row.opens,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    hoursLeft: Math.max(0, hoursBetween(row.expiresAt, now)),
    expired,
    project: project ? await hydrateProject(project.id) : null,
  };
}

export async function hydrateProject(projectId: string): Promise<ProjectDTO> {
  const db = await getDb();

  const [project, req, viz, images, designs, quote] = await Promise.all([
    db.query.projects.findFirst({ where: eq(t.projects.id, projectId) }),
    db.query.requirements.findFirst({ where: eq(t.requirements.projectId, projectId) }),
    db.query.visualizations.findFirst({
      where: eq(t.visualizations.projectId, projectId),
      orderBy: desc(t.visualizations.createdAt),
    }),
    db.query.projectImages.findMany({
      where: eq(t.projectImages.projectId, projectId),
      orderBy: t.projectImages.position,
    }),
    db.query.savedDesigns.findMany({ where: eq(t.savedDesigns.projectId, projectId) }),
    db.query.quotations.findFirst({
      where: eq(t.quotations.projectId, projectId),
      orderBy: desc(t.quotations.createdAt),
    }),
  ]);

  const spec = (req?.parsedSpec ?? null) as Record<string, unknown> | null;

  return {
    id: projectId,
    status: project?.status ?? "DRAFT",
    step: project?.step ?? 0,
    spec,
    measurements: (req?.measurements ?? null) as Record<string, unknown> | null,
    room: (viz?.roomModel ?? null) as Record<string, unknown> | null,
    roomEngine: viz?.engine ?? null,
    roomConfidence: viz?.confidence ?? null,
    images: images.map((i) => ({
      id: i.id,
      url: `/api/images/${i.id}`,
      position: i.position,
    })),
    savedDesigns: designs.map((d) => ({
      id: d.id,
      schemeId: d.schemeId,
      label: d.label,
      scheme: d.scheme,
      isChosen: d.isChosen,
    })),
    quotation: quote
      ? {
          id: quote.id,
          lines: quote.lines,
          areas: quote.areas,
          subtotal: quote.subtotal,
          discountPct: quote.discountPct,
          total: quote.total,
          status: quote.status,
        }
      : null,
    submittedAt: project?.submittedAt?.toISOString() ?? null,
    customerNote: (spec?.customerNote as string) ?? null,
  };
}

export async function getSessionById(id: string) {
  const db = await getDb();
  const row = await db.query.customerSessions.findFirst({
    where: eq(t.customerSessions.id, id),
  });
  return row ? hydrate(row) : undefined;
}

export async function getSessionByToken(token: string) {
  const db = await getDb();
  const row = await db.query.customerSessions.findFirst({
    where: eq(t.customerSessions.token, token.toUpperCase()),
  });
  return row ? hydrate(row) : undefined;
}

export async function listSessions(dealerId: string) {
  const db = await getDb();
  const rows = await db.query.customerSessions.findMany({
    where: eq(t.customerSessions.dealerId, dealerId),
    orderBy: desc(t.customerSessions.createdAt),
  });
  return Promise.all(rows.map(hydrate));
}

/** Called when the customer opens the link. */
export async function touchSession(token: string) {
  const db = await getDb();
  const session = await getSessionByToken(token);
  if (!session || session.expired) return session;

  await db
    .update(t.customerSessions)
    .set({
      opens: session.opens + 1,
      lastSeenAt: new Date(),
      status: session.status === "ACTIVE" ? "IN_PROGRESS" : session.status,
    })
    .where(eq(t.customerSessions.id, session.id));

  return getSessionById(session.id);
}

/* -------------------------------- writes -------------------------------- */

/**
 * Every customer write funnels through here, so expiry, submission and
 * ownership are checked in exactly one place.
 *
 * Returns an explicitly tagged result rather than relying on `in` narrowing —
 * a union discriminated by a real field is what stops a caller from reading
 * `.id` off an error by accident.
 */
export type WriteError = "not_found" | "expired" | "closed" | "no_project";
export type Result<T> = ({ ok: true } & T) | { ok: false; error: WriteError };

async function writableProject(
  token: string,
): Promise<Result<{ session: SessionDTO; projectId: string }>> {
  const session = await getSessionByToken(token);
  if (!session) return { ok: false, error: "not_found" };
  if (session.expired) return { ok: false, error: "expired" };
  if (session.status === "SUBMITTED" || session.status === "CLOSED") {
    return { ok: false, error: "closed" };
  }
  if (!session.project) return { ok: false, error: "no_project" };
  return { ok: true, session, projectId: session.project.id };
}

export async function saveRequirements(
  token: string,
  spec: Record<string, unknown>,
  measurements?: Record<string, unknown>,
  rawText?: string,
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.requirements.findFirst({
    where: eq(t.requirements.projectId, ctx.projectId),
  });

  if (existing) {
    await db
      .update(t.requirements)
      .set({
        parsedSpec: spec,
        measurements: measurements ?? existing.measurements,
        rawText: rawText ?? existing.rawText,
      })
      .where(eq(t.requirements.id, existing.id));
  } else {
    await db.insert(t.requirements).values({
      id: `req_${randomUUID()}`,
      projectId: ctx.projectId,
      parsedSpec: spec,
      measurements: measurements ?? null,
      rawText: rawText ?? null,
    });
  }

  await db
    .update(t.projects)
    .set({ status: "IN_PROGRESS", updatedAt: new Date() })
    .where(eq(t.projects.id, ctx.projectId));

  return { ok: true as const, projectId: ctx.projectId };
}

export async function setStep(token: string, step: number) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db
    .update(t.projects)
    .set({ step, updatedAt: new Date() })
    .where(eq(t.projects.id, ctx.projectId));
  return { ok: true as const };
}

export async function addImage(
  token: string,
  file: { data: Buffer; mimeType: string; bytes: number },
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.projectImages.findMany({
    where: eq(t.projectImages.projectId, ctx.projectId),
  });

  const key = await storage.put(file.data, file.mimeType);
  const id = `img_${randomUUID()}`;
  await db.insert(t.projectImages).values({
    id,
    projectId: ctx.projectId,
    storageKey: key,
    mimeType: file.mimeType,
    bytes: file.bytes,
    position: existing.length,
  });
  return { ok: true as const, id, url: `/api/images/${id}` };
}

export async function removeImage(token: string, imageId: string) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const img = await db.query.projectImages.findFirst({
    where: and(eq(t.projectImages.id, imageId), eq(t.projectImages.projectId, ctx.projectId)),
  });
  if (!img) return { ok: false as const, error: "not_found" as const };

  await storage.remove(img.storageKey);
  await db.delete(t.projectImages).where(eq(t.projectImages.id, imageId));
  return { ok: true as const };
}

export async function getImage(imageId: string) {
  const db = await getDb();
  const img = await db.query.projectImages.findFirst({
    where: eq(t.projectImages.id, imageId),
  });
  if (!img) return null;
  const data = await storage.get(img.storageKey);
  return data ? { data, mimeType: img.mimeType } : null;
}

export async function saveVisualization(
  token: string,
  roomModel: Record<string, unknown>,
  engine: string,
  confidence: string,
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db.insert(t.visualizations).values({
    id: `viz_${randomUUID()}`,
    projectId: ctx.projectId,
    roomModel,
    engine,
    confidence,
  });
  return { ok: true as const };
}

export async function saveRecommendations(token: string, schemes: unknown[]) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db.insert(t.recommendations).values({
    id: `rec_${randomUUID()}`,
    projectId: ctx.projectId,
    schemes,
  });
  return { ok: true as const };
}

/* ------------------------------- favourites ------------------------------ */

export async function saveDesign(
  token: string,
  design: { schemeId: string; label?: string; scheme: Record<string, unknown> },
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.savedDesigns.findMany({
    where: eq(t.savedDesigns.projectId, ctx.projectId),
  });
  const dupe = existing.find((d) => d.schemeId === design.schemeId);
  if (dupe) return { ok: true as const, id: dupe.id };

  const id = `sd_${randomUUID()}`;
  await db.insert(t.savedDesigns).values({
    id,
    projectId: ctx.projectId,
    schemeId: design.schemeId,
    label: design.label ?? null,
    scheme: design.scheme,
    // The first thing saved is the chosen one until the customer says otherwise.
    isChosen: existing.length === 0,
  });

  await db
    .update(t.projects)
    .set({ status: "IN_PROGRESS", updatedAt: new Date() })
    .where(eq(t.projects.id, ctx.projectId));

  return { ok: true as const, id };
}

export async function removeDesign(token: string, designId: string) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db
    .delete(t.savedDesigns)
    .where(and(eq(t.savedDesigns.id, designId), eq(t.savedDesigns.projectId, ctx.projectId)));
  return { ok: true as const };
}

export async function chooseDesign(token: string, designId: string) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db
    .update(t.savedDesigns)
    .set({ isChosen: false })
    .where(eq(t.savedDesigns.projectId, ctx.projectId));
  await db
    .update(t.savedDesigns)
    .set({ isChosen: true })
    .where(and(eq(t.savedDesigns.id, designId), eq(t.savedDesigns.projectId, ctx.projectId)));
  return { ok: true as const };
}

/* -------------------------------- submit --------------------------------- */

export async function submitProject(token: string, note?: string) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  const now = new Date();

  if (note) {
    const req = await db.query.requirements.findFirst({
      where: eq(t.requirements.projectId, ctx.projectId),
    });
    if (req) {
      await db
        .update(t.requirements)
        .set({ parsedSpec: { ...(req.parsedSpec as object), customerNote: note } })
        .where(eq(t.requirements.id, req.id));
    }
  }

  await db
    .update(t.projects)
    .set({ status: "SUBMITTED", submittedAt: now, updatedAt: now })
    .where(eq(t.projects.id, ctx.projectId));

  // The session closes with the submission (§20). The link still resolves —
  // it shows the confirmation — but nothing further can be written.
  await db
    .update(t.customerSessions)
    .set({ status: "SUBMITTED" })
    .where(eq(t.customerSessions.id, ctx.session.id));

  return { ok: true as const };
}

/* ------------------------------ dealer side ------------------------------ */

export async function saveQuotation(input: {
  dealerId: string;
  projectId: string;
  sessionId: string;
  lines: unknown[];
  areas: Record<string, unknown>;
  subtotal: number;
  discountPct: number;
  total: number;
  overrodeAvailability: boolean;
}) {
  const db = await getDb();
  const id = `q_${randomUUID()}`;
  await db.insert(t.quotations).values({ id, ...input, status: "SENT" });
  await db
    .update(t.projects)
    .set({ status: "QUOTED", quotedAt: new Date(), updatedAt: new Date() })
    .where(eq(t.projects.id, input.projectId));
  return { ok: true as const, id };
}

export async function deleteSession(id: string) {
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: eq(t.projects.sessionId, id) });
  if (project) {
    const images = await db.query.projectImages.findMany({
      where: eq(t.projectImages.projectId, project.id),
    });
    await Promise.all(images.map((i) => storage.remove(i.storageKey)));
  }
  await db.delete(t.customerSessions).where(eq(t.customerSessions.id, id));
  return { ok: true as const };
}
