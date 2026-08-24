import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
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

  // The four Round 2 reads join this existing Promise.all rather than forming a
  // second round trip. The customer app polls this endpoint, so an extra
  // sequential await here would be felt on every poll on a phone.
  const [project, req, viz, images, designs, quote, surface, profile, variations, climate] =
    await Promise.all([
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
      db.query.surfaceAnalyses.findFirst({
        where: eq(t.surfaceAnalyses.projectId, projectId),
        orderBy: desc(t.surfaceAnalyses.createdAt),
      }),
      db.query.designProfiles.findFirst({
        where: eq(t.designProfiles.projectId, projectId),
      }),
      db.query.designVariations.findMany({
        where: eq(t.designVariations.projectId, projectId),
        orderBy: desc(t.designVariations.createdAt),
      }),
      db.query.climateContexts.findFirst({
        where: eq(t.climateContexts.projectId, projectId),
        orderBy: desc(t.climateContexts.createdAt),
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

    // Round 2. Null is the normal case, not an error case.
    surface: surface
      ? {
          engine: surface.engine,
          observations: surface.observations,
          prep: surface.prepPlan,
          severity: surface.severity,
          confidence: surface.confidence,
          analysedAt: surface.createdAt.toISOString(),
        }
      : null,
    dna: (profile?.profile ?? null) as Record<string, unknown> | null,
    variationCount: variations.length,
    lastIntent: variations[0]?.intent ?? null,
    climate: climate ? { ...(climate.data as object), source: climate.source } : null,
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

/**
 * The dealer's whole list, in a fixed number of queries.
 *
 * The obvious implementation — hydrate each session in turn — costs about seven
 * queries per session, and the dashboard polls this every five seconds. Twenty
 * sessions became 140 round trips per poll, which is what made the console feel
 * sluggish. This loads each table once for the whole dealer and assembles the
 * objects in memory, so the cost is constant in the number of sessions.
 */
export async function listSessions(dealerId: string): Promise<SessionDTO[]> {
  const db = await getDb();
  const now = new Date();

  const rows = await db.query.customerSessions.findMany({
    where: eq(t.customerSessions.dealerId, dealerId),
    orderBy: desc(t.customerSessions.createdAt),
  });
  if (!rows.length) return [];

  const projects = await db.query.projects.findMany({
    where: eq(t.projects.dealerId, dealerId),
  });
  const projectIds = projects.map((p) => p.id);

  // Four more tables, still one query each for the whole dealer. The cost of
  // this function stays constant in the number of sessions, which is the
  // property the five-second dashboard poll depends on.
  // No visualizations query: the list no longer returns room models, so
  // fetching them was a round trip per poll for data that was discarded.
  const [reqs, images, designs, quotes, surfaces, profiles, variations, climates] =
    projectIds.length
      ? await Promise.all([
          db.query.requirements.findMany({ where: inArray(t.requirements.projectId, projectIds) }),
          db.query.projectImages.findMany({
            where: inArray(t.projectImages.projectId, projectIds),
            orderBy: t.projectImages.position,
          }),
          db.query.savedDesigns.findMany({ where: inArray(t.savedDesigns.projectId, projectIds) }),
          db.query.quotations.findMany({ where: inArray(t.quotations.projectId, projectIds) }),
          db.query.surfaceAnalyses.findMany({
            where: inArray(t.surfaceAnalyses.projectId, projectIds),
          }),
          db.query.designProfiles.findMany({
            where: inArray(t.designProfiles.projectId, projectIds),
          }),
          db.query.designVariations.findMany({
            where: inArray(t.designVariations.projectId, projectIds),
            orderBy: desc(t.designVariations.createdAt),
          }),
          db.query.climateContexts.findMany({
            where: inArray(t.climateContexts.projectId, projectIds),
          }),
        ])
      : [[], [], [], [], [], [], [], []];

  const group = <T extends { projectId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const item of list) {
      const arr = m.get(item.projectId);
      if (arr) arr.push(item);
      else m.set(item.projectId, [item]);
    }
    return m;
  };

  const byProjectReq = group(reqs);
  const byProjectImg = group(images);
  const byProjectDesign = group(designs);
  const byProjectQuote = group(quotes);
  const byProjectSurface = group(surfaces);
  const byProjectProfile = group(profiles);
  const byProjectVariation = group(variations);
  const byProjectClimate = group(climates);
  const projectBySession = new Map(projects.map((p) => [p.sessionId, p]));

  // Sessions that ran out are marked once, in a single statement, rather than
  // one UPDATE per stale row inside the loop.
  const newlyExpired = rows
    .filter((r) => now > r.expiresAt && r.status !== "EXPIRED" && r.status !== "SUBMITTED")
    .map((r) => r.id);
  if (newlyExpired.length) {
    await db
      .update(t.customerSessions)
      .set({ status: "EXPIRED" })
      .where(inArray(t.customerSessions.id, newlyExpired));
  }

  return rows.map((row) => {
    const expired = now > row.expiresAt && row.status !== "SUBMITTED";
    const project = projectBySession.get(row.id);
    const req = project ? byProjectReq.get(project.id)?.[0] : undefined;
    const quote = project ? byProjectQuote.get(project.id)?.slice(-1)[0] : undefined;
    const spec = (req?.parsedSpec ?? null) as Record<string, unknown> | null;
    // Most recent analysis wins; the list is already ordered by insertion.
    const surface = project ? byProjectSurface.get(project.id)?.slice(-1)[0] : undefined;
    const profile = project ? byProjectProfile.get(project.id)?.[0] : undefined;
    const vars = project ? (byProjectVariation.get(project.id) ?? []) : [];
    const climate = project ? byProjectClimate.get(project.id)?.slice(-1)[0] : undefined;

    return {
      id: row.id,
      token: row.token,
      dealerId: row.dealerId,
      customerName: row.customerName,
      phone: row.phone,
      status: expired ? "EXPIRED" : row.status,
      opens: row.opens,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      hoursLeft: Math.max(0, hoursBetween(row.expiresAt, now)),
      expired,
      project: project
        ? {
            id: project.id,
            status: project.status,
            step: project.step,
            spec,
            measurements: (req?.measurements ?? null) as Record<string, unknown> | null,
            // The 3D room model is deliberately NOT sent in the list.
            //
            // No dealer screen reads it — it exists for the customer's own
            // viewer, which loads a single project through `hydrateProject`.
            // Across thirty-odd sessions the palettes and traced masses came to
            // about 7 KB of every poll, five seconds apart, for data nothing
            // rendered. The single-project path below still returns it in full.
            room: null,
            roomEngine: null,
            roomConfidence: null,
            images: (byProjectImg.get(project.id) ?? []).map((i) => ({
              id: i.id,
              url: `/api/images/${i.id}`,
              position: i.position,
            })),
            savedDesigns: (byProjectDesign.get(project.id) ?? []).map((d) => ({
              id: d.id,
              schemeId: d.schemeId,
              label: d.label,
              scheme: d.scheme,
              isChosen: d.isChosen,
            })),
            quotation: quote
              ? {
                  id: quote.id,
                  // Line items and areas are omitted from the LIST on purpose.
                  // The dealer screen recomputes them with `buildQuote` from
                  // the spec, scheme and measurements it already has, so
                  // shipping the stored copy sent ~5 KB per poll that was
                  // parsed and thrown away. The PDF route reads the stored
                  // lines straight from the database, so the record a customer
                  // was sent is still the record that gets rendered.
                  lines: [],
                  areas: {},
                  subtotal: quote.subtotal,
                  discountPct: quote.discountPct,
                  total: quote.total,
                  status: quote.status,
                }
              : null,
            submittedAt: project.submittedAt?.toISOString() ?? null,
            customerNote: (spec?.customerNote as string) ?? null,

            surface: surface
              ? {
                  engine: surface.engine,
                  observations: surface.observations,
                  prep: surface.prepPlan,
                  severity: surface.severity,
                  confidence: surface.confidence,
                  analysedAt: surface.createdAt.toISOString(),
                }
              : null,
            dna: (profile?.profile ?? null) as Record<string, unknown> | null,
            variationCount: vars.length,
            lastIntent: vars[0]?.intent ?? null,
            climate: climate
              ? { ...(climate.data as object), source: climate.source }
              : null,
          }
        : null,
    };
  });
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

/**
 * The customer confirms who they are.
 *
 * A dealer often issues a code before asking a name — "scan this while I finish
 * with him" — so the session starts as "Walk-in customer". Letting the customer
 * fill it in on the review screen is the difference between a design the dealer
 * can follow up and one he cannot.
 */
export async function updateContact(
  token: string,
  input: { customerName?: string; phone?: string },
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const patch: Partial<typeof t.customerSessions.$inferInsert> = {};
  const name = input.customerName?.trim();
  const phone = input.phone?.trim();
  if (name) patch.customerName = name;
  if (phone) patch.phone = phone;
  if (!Object.keys(patch).length) return { ok: true as const };

  await db
    .update(t.customerSessions)
    .set(patch)
    .where(eq(t.customerSessions.id, ctx.session.id));
  return { ok: true as const };
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

/* --------------------------- Round 2: intelligence ------------------------ */

/**
 * Persist a surface-health reading.
 *
 * One row per (project, image) by unique index — re-analysing the same
 * photograph replaces the reading rather than appending a near-duplicate, which
 * is what stops the dealer's alert list filling with the same wall five times.
 * A whole-project analysis (imageId null) is stored the same way.
 */
export async function saveSurfaceAnalysis(
  token: string,
  report: {
    engine: string;
    observations: unknown[];
    prep: unknown[];
    severity: string;
    confidence: string;
  },
  imageId?: string | null,
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.surfaceAnalyses.findMany({
    where: eq(t.surfaceAnalyses.projectId, ctx.projectId),
  });
  const dupe = existing.find((r) => (r.imageId ?? null) === (imageId ?? null));

  const values = {
    projectId: ctx.projectId,
    imageId: imageId ?? null,
    engine: report.engine,
    observations: report.observations,
    prepPlan: report.prep,
    severity: report.severity,
    confidence: report.confidence,
  };

  if (dupe) {
    await db
      .update(t.surfaceAnalyses)
      .set({ ...values, createdAt: new Date() })
      .where(eq(t.surfaceAnalyses.id, dupe.id));
    return { ok: true as const, id: dupe.id };
  }

  const id = `sa_${randomUUID()}`;
  await db.insert(t.surfaceAnalyses).values({ id, ...values });
  return { ok: true as const, id };
}

/**
 * Append design signals and re-derive the profile.
 *
 * Signals are append-only and the profile is recomputed from the whole list
 * every time, never patched incrementally. That costs a few milliseconds and
 * buys the guarantee that the stored profile always equals what the current
 * rules would produce from the stored evidence — so improving the rules fixes
 * every existing profile instead of leaving a generation of stale ones behind.
 *
 * The list is capped. A customer who taps through forty schemes produces forty
 * signals, and past a couple of hundred the tail contributes nothing to a
 * recency-free tally while making every write larger.
 */
const MAX_SIGNALS = 200;

export async function recordDesignSignals(
  token: string,
  incoming: unknown[],
  derive: (signals: unknown[]) => Record<string, unknown>,
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.designProfiles.findFirst({
    where: eq(t.designProfiles.sessionId, ctx.session.id),
  });

  const signals = [...((existing?.signals as unknown[]) ?? []), ...incoming].slice(-MAX_SIGNALS);
  const profile = derive(signals);

  if (existing) {
    await db
      .update(t.designProfiles)
      .set({ signals, profile, updatedAt: new Date() })
      .where(eq(t.designProfiles.id, existing.id));
    return { ok: true as const, profile };
  }

  await db.insert(t.designProfiles).values({
    id: `dp_${randomUUID()}`,
    sessionId: ctx.session.id,
    projectId: ctx.projectId,
    signals,
    profile,
  });
  return { ok: true as const, profile };
}

/** The raw evidence, for re-deriving a profile after a rules change. */
export async function getDesignSignals(token: string): Promise<unknown[]> {
  const session = await getSessionByToken(token);
  if (!session) return [];
  const db = await getDb();
  const row = await db.query.designProfiles.findFirst({
    where: eq(t.designProfiles.sessionId, session.id),
  });
  return (row?.signals as unknown[]) ?? [];
}

/** A What-If run, kept so the dealer sees which direction was explored. */
export async function saveVariation(
  token: string,
  input: { intent: string; baseSpec: Record<string, unknown>; schemes: unknown[]; engine: string },
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();
  await db.insert(t.designVariations).values({
    id: `dv_${randomUUID()}`,
    projectId: ctx.projectId,
    intent: input.intent,
    baseSpec: input.baseSpec,
    schemes: input.schemes,
    engine: input.engine,
  });
  return { ok: true as const };
}

/**
 * The environmental context a recommendation was made under.
 *
 * One row per project, replaced rather than appended: the useful question is
 * "what was assumed when this was designed", and a history of near-identical
 * monthly normals answers nothing while growing without bound.
 */
export async function saveClimateContext(
  token: string,
  input: { city: string | null; source: string; data: Record<string, unknown> },
) {
  const ctx = await writableProject(token);
  if (!ctx.ok) return ctx;
  const db = await getDb();

  const existing = await db.query.climateContexts.findFirst({
    where: eq(t.climateContexts.projectId, ctx.projectId),
  });
  if (existing) {
    await db
      .update(t.climateContexts)
      .set({ city: input.city, source: input.source, data: input.data, createdAt: new Date() })
      .where(eq(t.climateContexts.id, existing.id));
    return { ok: true as const };
  }

  await db.insert(t.climateContexts).values({
    id: `cc_${randomUUID()}`,
    projectId: ctx.projectId,
    city: input.city,
    source: input.source,
    data: input.data,
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
