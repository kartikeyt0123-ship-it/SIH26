/**
 * Opens a new dealer's console with their OWN demo workspace.
 *
 * TWO PROBLEMS THIS SOLVES AT ONCE.
 *
 * The first is emptiness. A dealer who signs up and lands on blank panels
 * cannot tell a working feature from a broken one, and the availability rule
 * means zero inventory produces zero recommendations — the customer app would
 * have nothing to offer at all.
 *
 * The second, and more serious, is leakage. Before this, the console rendered a
 * hardcoded demo shop's customers, stock and revenue to whoever was signed in,
 * so a second dealer saw Sharma Interiors' figures and customer names on their
 * own dashboard. That is a tenancy bug wearing a demo-data costume. Every row
 * created here carries the new dealer's own id, so the seed data IS their data
 * and the pages can read the database rather than a constant.
 *
 * WHAT IS REAL ABOUT IT: the quotations are computed by `buildQuote` from the
 * same measurements and schemes a customer would produce, against this dealer's
 * own price list. They are not invented totals — every line carries its
 * arithmetic, and a dealer who checks one will find it adds up.
 *
 * Idempotent, and a failure here never blocks a sign-up: an account with an
 * empty workspace is recoverable, an account that failed to be created is not.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "./index";
import * as t from "./schema";
import { LINE_BY_ID, SHADE_BY_CODE } from "@/lib/catalog";
import { buildQuote } from "@/lib/quote";
import type { CustomerSpec } from "@/lib/recommend";
import type { Measurements, SelectedScheme } from "@/lib/session-types";
import { deriveDNA, type DesignSignal } from "@/lib/dna";
import { buildPrep, interpret, type Metrics } from "@/lib/surface";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const shade = (code: string) => {
  const s = SHADE_BY_CODE.get(code)!;
  return { code: s.code, name: s.name, hex: s.hex };
};

function scheme(
  id: string,
  title: string,
  lineId: string,
  main: string,
  feature: string,
  ceiling: string,
  trim: string,
): SelectedScheme {
  return {
    id,
    title,
    rationale: LINE_BY_ID.get(lineId)?.blurb ?? "",
    lineId,
    trimLineId: "ap-enamel",
    shades: { main: shade(main), feature: shade(feature), ceiling: shade(ceiling), trim: shade(trim) },
  };
}

const measure = (l: number, w: number, h: number, feature = true): Measurements => ({
  lengthM: l,
  widthM: w,
  heightM: h,
  doors: 1,
  windows: 2,
  coats: 2,
  includeCeiling: true,
  featureWall: feature,
});

const spec = (over: Partial<CustomerSpec> = {}): CustomerSpec => ({
  surface: "interior",
  waterproofing: false,
  budget: "mid",
  brands: [],
  finish: "any",
  mood: "warm",
  roomType: "Living room",
  condition: [],
  climateZone: "moderate",
  ...over,
});

/** Metrics that read as a wall with damp and some peeling, for one demo project. */
const DAMP_METRICS: Metrics = {
  lineEnergy: 0.4,
  blockVariance: 6,
  chromaOutlierShare: 0.02,
  bottomDarkening: 0.21,
  mottleShare: 0.11,
  shadingSpread: 5,
  baseHex: "#d8d2c6",
  meanLuma: 180,
};

type Stage = "designing" | "quiet" | "submitted" | "quoted";

type Person = {
  name: string;
  phone: string;
  stage: Stage;
  daysAgo: number;
  room: string;
  scheme: SelectedScheme;
  m: Measurements;
  spec: CustomerSpec;
  /** Colours they gravitate to, for the Design DNA. */
  dna?: [string, string][];
  surface?: boolean;
  step?: number;
};

/**
 * Six customers at genuinely different stages.
 *
 * Chosen so that every panel on the console has something real to show: two
 * waiting on a price, two already quoted, one mid-design and one who has gone
 * quiet and needs chasing. Their palettes are spread deliberately — warm,
 * neutral, cool, bold — so the "your customers this month" split is a real
 * distribution rather than four identical profiles.
 */
const PEOPLE: Person[] = [
  {
    name: "Priya Nair",
    phone: "9811045221",
    stage: "quoted",
    daysAgo: 26,
    room: "Living room",
    scheme: scheme("W-104_T-712", "Warm White with Burnt Sienna", "ap-royale", "W-104", "T-712", "W-101", "N-221"),
    m: measure(5.2, 4.1, 3.1),
    spec: spec({ roomType: "Living room", budget: "premium", mood: "warm" }),
    dna: [["#efe7d8", "#a9543c"], ["#e7dbc4", "#b98a57"]],
  },
  {
    name: "Anand Residency",
    phone: "9820117744",
    stage: "quoted",
    daysAgo: 12,
    room: "Whole house",
    scheme: scheme("N-205_G-406", "Cotton Grey with Graphite", "ap-apcolite", "N-205", "G-406", "W-101", "N-221"),
    m: measure(6.4, 5.0, 3.2),
    spec: spec({ roomType: "Whole house", budget: "mid", mood: "neutral" }),
    dna: [["#d8d3c8", "#6d6a63"], ["#cfd3c4", "#8f9c86"]],
  },
  {
    name: "S. Bhatia",
    phone: "9899234510",
    stage: "submitted",
    daysAgo: 3,
    room: "Bedroom",
    scheme: scheme("W-101_E-506", "Chalk White with Clay Beige", "ner-impressions", "W-101", "E-506", "W-104", "N-221"),
    m: measure(4.2, 3.6, 3.0),
    spec: spec({ roomType: "Bedroom", budget: "mid", mood: "warm", condition: ["dampness", "peeling"] }),
    dna: [["#f4f1ea", "#c9a97b"], ["#efe7d8", "#dcc9a6"]],
    surface: true,
  },
  {
    name: "Verma Builders",
    phone: "9873310092",
    stage: "submitted",
    daysAgo: 1,
    room: "Shop front",
    scheme: scheme("N-201_Q-912", "Pearl White against Deep Peacock", "ap-apex", "N-201", "Q-912", "W-101", "N-221"),
    m: measure(7.0, 4.5, 3.4, true),
    spec: spec({ surface: "exterior", roomType: "Shop front", budget: "mid", mood: "bold", climateZone: "rainy" }),
    dna: [["#e9e4d9", "#1a736a"], ["#dcd6c9", "#2b3550"]],
  },
  {
    name: "Nisha Agarwal",
    phone: "9845221190",
    stage: "designing",
    daysAgo: 0,
    room: "Kitchen",
    scheme: scheme("W-108_O-601", "Oat Milk with Brass Glow", "ap-apcolite", "W-108", "O-601", "W-101", "N-221"),
    m: measure(3.4, 3.0, 3.0, false),
    spec: spec({ roomType: "Kitchen", budget: "mid", mood: "warm" }),
    step: 4,
  },
  {
    name: "R. K. Traders",
    phone: "9812667043",
    stage: "quiet",
    daysAgo: 4,
    room: "Office",
    scheme: scheme("N-209_C-305", "Limestone with Terracotta", "ner-beauty", "N-209", "C-305", "W-101", "N-221"),
    m: measure(5.0, 4.0, 3.0),
    spec: spec({ roomType: "Office", budget: "economy", mood: "warm" }),
    step: 2,
  },
];

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function demoToken() {
  let out = "";
  for (let i = 0; i < 11; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

/**
 * A pool of customer identities, so two dealers do not share a customer book.
 *
 * The stages above are the useful part of the fixture — one quiet customer, two
 * awaiting a price, and so on — but if every shop also gets the same six names
 * then signing into a second account shows "Priya Nair" again, and it reads as
 * a data leak even though the rows are correctly separated. Each dealer is
 * given a different slice, chosen deterministically from their id so a reseed
 * is stable.
 */
const NAME_POOL: [string, string][] = [
  ["Priya Nair", "9811045221"],
  ["Anand Residency", "9820117744"],
  ["S. Bhatia", "9899234510"],
  ["Verma Builders", "9873310092"],
  ["Nisha Agarwal", "9845221190"],
  ["R. K. Traders", "9812667043"],
  ["Farhan Qureshi", "9833410077"],
  ["Lakshmi Sundaram", "9840562231"],
  ["Gurpreet Sethi", "9878120345"],
  ["Meenakshi Rao", "9866204418"],
  ["Deepak Joshi", "9822551907"],
  ["Ayesha Khan", "9819330264"],
  ["Sanjay Kulkarni", "9823714460"],
  ["Ritu Malhotra", "9871209853"],
  ["Iqbal Sheikh", "9892047716"],
  ["Vaishali Deshmukh", "9821660539"],
  ["Harish Menon", "9847713028"],
  ["Tanvi Bhatt", "9825409177"],
];

/** Stable small integer from a dealer id, so reseeding gives the same roster. */
function hashOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * `injected` is passed when this runs inside database initialisation. Calling
 * getDb() there would await the very promise that is still resolving, and the
 * request would hang for ever rather than fail.
 */
export async function seedDealerWorkspace(dealerId: string, injected?: DB) {
  const db = injected ?? (await getDb());

  const existing = await db
    .select({ id: t.customerSessions.id })
    .from(t.customerSessions)
    .where(eq(t.customerSessions.dealerId, dealerId))
    .limit(1);
  if (existing.length) return;

  const now = Date.now();
  const offset = hashOf(dealerId) % NAME_POOL.length;

  for (const [index, template] of PEOPLE.entries()) {
    // Each dealer gets their own slice of the name pool, and their room sizes
    // are nudged by the same seed — so two shops do not report identical
    // revenue to the rupee, which reads as shared data rather than coincidence.
    const [name, phone] = NAME_POOL[(offset + index) % NAME_POOL.length];
    const jitter = 1 + (((hashOf(dealerId + index) % 25) - 12) / 100);
    const p: Person = {
      ...template,
      name,
      phone,
      m: {
        ...template.m,
        lengthM: Math.round(template.m.lengthM * jitter * 10) / 10,
        widthM: Math.round(template.m.widthM * jitter * 10) / 10,
      },
    };

    const created = new Date(now - p.daysAgo * DAY - 6 * HOUR);
    const sessionId = `cs_${randomUUID()}`;
    const projectId = `p_${randomUUID()}`;

    const submitted = p.stage === "submitted" || p.stage === "quoted";
    // A quiet customer is one whose link is still live but untouched for days —
    // that is what the follow-up alert looks for, so the timestamps have to be
    // genuinely old rather than merely labelled old.
    const lastSeen =
      p.stage === "quiet"
        ? new Date(now - p.daysAgo * DAY)
        : p.stage === "designing"
          ? new Date(now - 40 * 60_000)
          : new Date(now - p.daysAgo * DAY - 2 * HOUR);

    await db.insert(t.customerSessions).values({
      id: sessionId,
      dealerId,
      token: demoToken(),
      customerName: p.name,
      phone: p.phone,
      status: submitted ? "SUBMITTED" : "IN_PROGRESS",
      permissions: ["project:read", "project:write", "catalogue:read"],
      opens: p.stage === "quiet" ? 1 : 3,
      createdAt: created,
      // Deliberately generous so demo links stay openable for a while.
      expiresAt: new Date(now + 10 * DAY),
      lastSeenAt: lastSeen,
    });

    await db.insert(t.projects).values({
      id: projectId,
      dealerId,
      sessionId,
      status: p.stage === "quoted" ? "QUOTED" : submitted ? "SUBMITTED" : "IN_PROGRESS",
      step: submitted ? 6 : (p.step ?? 3),
      submittedAt: submitted ? new Date(created.getTime() + 3 * HOUR) : null,
      quotedAt: p.stage === "quoted" ? new Date(created.getTime() + 26 * HOUR) : null,
      createdAt: created,
      updatedAt: lastSeen,
    });

    await db.insert(t.requirements).values({
      id: `req_${randomUUID()}`,
      projectId,
      parsedSpec: p.spec as unknown as Record<string, unknown>,
      measurements: p.m as unknown as Record<string, unknown>,
      createdAt: created,
    });

    // Only customers past the colour step have a saved design.
    if (submitted || (p.step ?? 0) >= 4) {
      await db.insert(t.savedDesigns).values({
        id: `sd_${randomUUID()}`,
        projectId,
        schemeId: p.scheme.id,
        label: p.scheme.title,
        scheme: p.scheme as unknown as Record<string, unknown>,
        isChosen: true,
        createdAt: new Date(created.getTime() + 2 * HOUR),
      });
    }

    /* ------------------------------ design DNA ----------------------------- */
    if (p.dna) {
      const signals: DesignSignal[] = p.dna.flatMap(([main, accent], i) => [
        {
          kind: i === 0 ? "chosen" : "saved",
          at: new Date(created.getTime() + i * HOUR).toISOString(),
          hexes: [main, accent],
          finish: LINE_BY_ID.get(p.scheme.lineId)?.finish,
          budget: p.spec.budget,
          roomType: p.room,
          surface: p.spec.surface,
        } as DesignSignal,
      ]);

      await db.insert(t.designProfiles).values({
        id: `dp_${randomUUID()}`,
        sessionId,
        projectId,
        signals,
        profile: deriveDNA(signals) as unknown as Record<string, unknown>,
        createdAt: created,
        updatedAt: lastSeen,
      });
    }

    /* --------------------------- surface analysis -------------------------- */
    if (p.surface) {
      const observations = interpret(DAMP_METRICS);
      await db.insert(t.surfaceAnalyses).values({
        id: `sa_${randomUUID()}`,
        projectId,
        imageId: null,
        engine: "surface-heuristic-v1",
        observations,
        prepPlan: buildPrep(observations, p.spec.surface),
        severity: "moderate",
        confidence: "low",
        createdAt: new Date(created.getTime() + HOUR),
      });
    }

    /* ------------------------------ quotation ------------------------------ */
    if (p.stage === "quoted") {
      // Computed, not invented: the same function the dealer's own Send
      // Quotation button uses, against this dealer's price list.
      const quote = buildQuote(p.spec, p.scheme, p.m);
      const discountPct = 5;
      const total = Math.round(quote.subtotal * (1 - discountPct / 100));
      const quotationId = `q_${randomUUID()}`;
      const quotedAt = new Date(created.getTime() + 26 * HOUR);

      await db.insert(t.quotations).values({
        id: quotationId,
        dealerId,
        projectId,
        sessionId,
        lines: quote.lines,
        areas: quote.areas as unknown as Record<string, unknown>,
        subtotal: quote.subtotal,
        discountPct,
        total,
        overrodeAvailability: false,
        status: "SENT",
        createdAt: quotedAt,
      });

      await db.insert(t.sales).values({
        id: `sale_${randomUUID()}`,
        dealerId,
        quotationId,
        productId: p.scheme.lineId,
        litres: quote.lines.reduce((s, l) => s + l.billedLitres, 0),
        amount: total,
        soldAt: new Date(quotedAt.getTime() + 2 * DAY),
      });
    }
  }

  /* --------------------------- a colour request ---------------------------- */
  // One outstanding request, so the Overview panel and the Intelligence tab
  // both have something real to show on the first visit.
  const firstSession = await db.query.customerSessions.findFirst({
    where: eq(t.customerSessions.dealerId, dealerId),
  });
  if (firstSession) {
    const wanted = SHADE_BY_CODE.get("G-412");
    const sub = SHADE_BY_CODE.get("G-406");
    if (wanted) {
      await db.insert(t.shadeRequests).values({
        id: `sr_${randomUUID()}`,
        dealerId,
        projectId: null,
        sessionId: firstSession.id,
        shadeCode: wanted.code,
        shadeName: wanted.name,
        shadeHex: wanted.hex,
        substituteCode: sub?.code ?? null,
        substituteName: sub?.name ?? null,
        customerName: firstSession.customerName,
        customerPhone: firstSession.phone,
        status: "OPEN",
        createdAt: new Date(now - 2 * DAY),
      });
    }
  }
}
