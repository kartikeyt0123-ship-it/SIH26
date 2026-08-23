/**
 * Rachna AI relational schema (§26).
 *
 * Written for PostgreSQL and driven through Drizzle. In development this runs
 * on PGlite — real Postgres compiled to WASM, backed by a local file — so the
 * SQL, the constraints and the migrations are genuine rather than simulated.
 * Pointing at Supabase or any hosted Postgres is a DATABASE_URL change and a
 * driver swap in `src/db/index.ts`; nothing in this file moves.
 *
 * Multi-tenancy rule: every table holding dealer data carries `dealerId`.
 * Catalogue tables (brands, products, shades) are global and read-only to
 * tenants — catalogue quality must improve as dealers are added, never degrade.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------ tenants ------------------------------- */

export const dealers = pgTable(
  "dealers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    city: text("city").notNull(),
    pincode: text("pincode"),
    /** The account identifier. Unique, because it is what you sign in with. */
    phone: text("phone"),
    /** scrypt, salted per dealer. Never a reversible encoding. */
    passwordHash: text("password_hash"),
    /**
     * Shop coordinates, resolved once at sign-up from the city they typed.
     *
     * Stored so the weather lookup is a direct forecast call rather than a
     * geocode plus a forecast on every request — and so a dealer whose city
     * name is ambiguous is pinned to the place they actually confirmed.
     */
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    tier: text("tier").default("Pro").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byPhone: uniqueIndex("dealers_phone").on(t.phone) }),
);

/**
 * One-time codes for sign-up and sign-in.
 *
 * The code is HASHED, exactly like a password. A one-time code is a credential
 * for the minutes it lives, and a leaked database that hands over live codes is
 * no better than one that hands over passwords.
 *
 * `attempts` is what makes a six-digit secret defensible: a million guesses is
 * nothing to a machine, five is the whole budget here.
 */
export const otpChallenges = pgTable("otp_challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  /** signup | login */
  purpose: text("purpose").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed: boolean("consumed").notNull().default(false),
  /** Which channel actually delivered it. "console" means nothing was sent. */
  channel: text("channel").notNull().default("console"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  role: text("role").notNull().default("DEALER"), // DEALER | STAFF
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------------------------- shared catalogue ------------------------- */

export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** interior | exterior | waterproofing | primer | putty | enamel */
  slug: text("slug").notNull(),
  /** Shown to the customer when choosing a paint type (§9). */
  customerLabel: text("customer_label").notNull(),
  description: text("description"),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").references(() => brands.id).notNull(),
  categoryId: text("category_id").references(() => categories.id).notNull(),
  name: text("name").notNull(),
  finish: text("finish").notNull(),
  budgetBand: text("budget_band").notNull(), // economy | mid | premium
  mrpPerLitre: integer("mrp_per_litre").notNull(),
  /** sq ft per litre per coat, on a primed surface. */
  coverage: integer("coverage").notNull(),
  packSizes: jsonb("pack_sizes").$type<number[]>().notNull(),
  features: jsonb("features").$type<string[]>().notNull(),
  blurb: text("blurb"),
});

export const shades = pgTable("shades", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  hex: text("hex").notNull(),
  family: text("family").notNull(),
  labL: real("lab_l").notNull(),
  labA: real("lab_a").notNull(),
  labB: real("lab_b").notNull(),
  /** Works over a large area without becoming oppressive. */
  wallSafe: boolean("wall_safe").notNull().default(true),
  exteriorSuitable: boolean("exterior_suitable").notNull().default(true),
});

/* ------------------------------ inventory ------------------------------ */

export const inventory = pgTable(
  "inventory",
  {
    id: text("id").primaryKey(),
    dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
    productId: text("product_id").references(() => products.id).notNull(),
    litres: doublePrecision("litres").notNull().default(0),
    reorderLevel: doublePrecision("reorder_level").notNull().default(0),
    weeklyOfftake: doublePrecision("weekly_offtake").notNull().default(0),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    sellingPerLitre: integer("selling_per_litre").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ dealerProduct: uniqueIndex("inventory_dealer_product").on(t.dealerId, t.productId) }),
);

/**
 * Which shades this dealer can actually produce today.
 *
 * A row exists per dealer per shade with `producible`. In the real system this
 * is computed from base stock and colorant levels; storing it keeps the
 * customer app honest about what it offers while that engine is built.
 */
export const dealerShades = pgTable(
  "dealer_shades",
  {
    dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
    shadeCode: text("shade_code").references(() => shades.code).notNull(),
    producible: boolean("producible").notNull().default(true),
    blockedReason: text("blocked_reason"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.dealerId, t.shadeCode] }) }),
);

/* --------------------------- customer sessions -------------------------- */

/**
 * §5 / §27. The QR is only an entry point into one of these.
 *
 * The token is the credential: unguessable, single-dealer, expiring, and it
 * carries no dealer privileges. `permissions` is stored rather than implied so
 * a session can later be issued read-only or scoped to a single project.
 */
export const customerSessions = pgTable("customer_sessions", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  /** ACTIVE | IN_PROGRESS | DESIGN_SAVED | SUBMITTED | EXPIRED | CLOSED */
  status: text("status").notNull().default("ACTIVE"),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  opens: integer("opens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  locality: text("locality"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* -------------------------------- projects ------------------------------ */

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  sessionId: text("session_id")
    .references(() => customerSessions.id, { onDelete: "cascade" })
    .notNull(),
  customerId: text("customer_id").references(() => customers.id),
  title: text("title"),
  /** DRAFT | IN_PROGRESS | SUBMITTED | QUOTED | CONVERTED | REJECTED */
  status: text("status").notNull().default("DRAFT"),
  /** Wizard position, so a customer returning within the window resumes. */
  step: integer("step").notNull().default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const requirements = pgTable("requirements", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  /** Free text or transcript, when the customer gives one. */
  rawText: text("raw_text"),
  /** The structured spec the recommender consumes. */
  parsedSpec: jsonb("parsed_spec").$type<Record<string, unknown>>().notNull(),
  /** Customer-entered. Never inferred from a photograph. */
  measurements: jsonb("measurements").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * §11. Binary never goes in Postgres — only the pointer.
 *
 * `storageKey` is opaque to the app: today it addresses a file on the server's
 * disk, tomorrow a Supabase Storage object. Only `lib/storage.ts` knows which.
 */
export const projectImages = pgTable("project_images", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** §12 — one analysis across all of a project's images, not one per image. */
export const visualizations = pgTable("visualizations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  /** The RoomModel: proportions, floor line, light, palette, confidence. */
  roomModel: jsonb("room_model").$type<Record<string, unknown>>().notNull(),
  /** "heuristic-v1" today; a hosted vision model later. Recorded, not implied. */
  engine: text("engine").notNull(),
  confidence: text("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  /** The full ranked set, with rationale and availability, as generated. */
  schemes: jsonb("schemes").$type<unknown[]>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** §17 — a customer may shortlist several before choosing one. */
export const savedDesigns = pgTable("saved_designs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  schemeId: text("scheme_id").notNull(),
  label: text("label"),
  scheme: jsonb("scheme").$type<Record<string, unknown>>().notNull(),
  isChosen: boolean("is_chosen").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quotations = pgTable("quotations", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  sessionId: text("session_id").references(() => customerSessions.id).notNull(),
  lines: jsonb("lines").$type<unknown[]>().notNull(),
  areas: jsonb("areas").$type<Record<string, unknown>>().notNull(),
  subtotal: integer("subtotal").notNull(),
  discountPct: real("discount_pct").notNull().default(0),
  total: integer("total").notNull(),
  /** True only when the dealer knowingly quoted something out of stock (§23). */
  overrodeAvailability: boolean("overrode_availability").notNull().default(false),
  status: text("status").notNull().default("DRAFT"), // DRAFT | SENT | ACCEPTED | LOST
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  quotationId: text("quotation_id").references(() => quotations.id),
  productId: text("product_id").references(() => products.id),
  litres: doublePrecision("litres").notNull(),
  amount: integer("amount").notNull(),
  soldAt: timestamp("sold_at", { withTimezone: true }).defaultNow().notNull(),
});

/** §25 — the interface for weather / seasonality / trend inputs. */
export const demandSignals = pgTable("demand_signals", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(), // weather | trend | local
  headline: text("headline").notNull(),
  reason: text("reason").notNull(),
  action: text("action").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull(),
  confidence: text("confidence").notNull(),
  /** Where it came from. "demo" until a real feed is connected — never implied. */
  source: text("source").notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------- relations ------------------------------ */

export const dealerRelations = relations(dealers, ({ many }) => ({
  inventory: many(inventory),
  sessions: many(customerSessions),
  projects: many(projects),
  quotations: many(quotations),
}));

export const sessionRelations = relations(customerSessions, ({ one, many }) => ({
  dealer: one(dealers, { fields: [customerSessions.dealerId], references: [dealers.id] }),
  projects: many(projects),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  dealer: one(dealers, { fields: [projects.dealerId], references: [dealers.id] }),
  session: one(customerSessions, {
    fields: [projects.sessionId],
    references: [customerSessions.id],
  }),
  requirements: many(requirements),
  images: many(projectImages),
  visualizations: many(visualizations),
  recommendations: many(recommendations),
  savedDesigns: many(savedDesigns),
  quotations: many(quotations),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  inventory: many(inventory),
}));

/* ==========================================================================
 * Round 2 — the intelligence layer.
 *
 * Four additive tables. Nothing above this line changed, so every Round 1
 * query, migration and screen behaves exactly as it did. Each table hangs off
 * `projects`, which already carries `dealerId`, so multi-tenancy is inherited
 * rather than re-implemented.
 * ======================================================================== */

/**
 * §R2.1 — one surface-health report per analysis run.
 *
 * Kept as history rather than a single mutable row: a customer who re-shoots a
 * wall should be able to see that the reading changed, and the dealer should
 * see what was on screen when the design was chosen.
 *
 * `engine` records what produced it — "heuristic-v1" today, a hosted vision
 * model later. It is never implied, so nothing downstream can present a
 * pixel-statistics reading as a trained classifier.
 */
export const surfaceAnalyses = pgTable(
  "surface_analyses",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    /** Which uploaded image this reading came from, when it came from one. */
    imageId: text("image_id").references(() => projectImages.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    /** SurfaceObservation[] — code, label, severity, confidence, evidence. */
    observations: jsonb("observations").$type<unknown[]>().notNull(),
    /** The ordered preparation workflow, with the product category per step. */
    prepPlan: jsonb("prep_plan").$type<unknown[]>().notNull(),
    /** none | light | moderate | significant — drives the dealer's alert list. */
    severity: text("severity").notNull().default("none"),
    confidence: text("confidence").notNull().default("low"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byProject: uniqueIndex("surface_analyses_project_image").on(t.projectId, t.imageId) }),
);

/**
 * §R2.2 — Rachna Design DNA.
 *
 * One row per session, updated in place. `signals` is the append-only evidence
 * (what was viewed, saved, discarded); `profile` is the derived summary. Both
 * are stored because the profile is a pure function of the signals — keeping
 * the inputs means the derivation can be improved, or replaced by a model,
 * and every existing profile can be recomputed rather than lost.
 */
export const designProfiles = pgTable(
  "design_profiles",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .references(() => customerSessions.id, { onDelete: "cascade" })
      .notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    /** DesignSignal[] — the raw interaction record. */
    signals: jsonb("signals").$type<unknown[]>().notNull(),
    /** DesignDNA — style, palette, finish, budget, colours, confidence. */
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull(),
    /** "rules-v1". Rule-based, and labelled as such wherever it is shown. */
    engine: text("engine").notNull().default("rules-v1"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ bySession: uniqueIndex("design_profiles_session").on(t.sessionId) }),
);

/**
 * §R2.6 — What-If variations.
 *
 * Persisted so the dealer can see which direction the customer explored, not
 * only where they landed. A variation that was generated and rejected is a
 * strong preference signal, and it feeds the Design DNA.
 */
export const designVariations = pgTable("design_variations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  /** premium | brighter | warmer | minimal | bold-accent | low-maintenance */
  intent: text("intent").notNull(),
  /** The spec the variation was generated from, so it can be reproduced. */
  baseSpec: jsonb("base_spec").$type<Record<string, unknown>>().notNull(),
  /** The generated Scheme[]. */
  schemes: jsonb("schemes").$type<unknown[]>().notNull(),
  engine: text("engine").notNull().default("rules-v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * §R2.4 — the environmental context a recommendation was made under.
 *
 * `source` is the honesty valve. "demo" means the figures came from the built-in
 * climate table for the city and month; it is rendered as simulated wherever it
 * appears. A configured provider writes its own name here instead, and only
 * then is the reading presented as live.
 */
export const climateContexts = pgTable("climate_contexts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  city: text("city"),
  /** demo | open-meteo | … — never implied. */
  source: text("source").notNull().default("demo"),
  /** ClimateContext — humidity, rainfall, heat, exposure, season. */
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const surfaceAnalysisRelations = relations(surfaceAnalyses, ({ one }) => ({
  project: one(projects, { fields: [surfaceAnalyses.projectId], references: [projects.id] }),
}));

export const designProfileRelations = relations(designProfiles, ({ one }) => ({
  session: one(customerSessions, {
    fields: [designProfiles.sessionId],
    references: [customerSessions.id],
  }),
  project: one(projects, { fields: [designProfiles.projectId], references: [projects.id] }),
}));

/**
 * A colour the customer wanted and the dealer cannot currently produce.
 *
 * This is the honest counterpart to the availability rule. Everywhere else the
 * product refuses to show a shade the dealer cannot make — correct, because a
 * promise that breaks at the counter is worse than no promise. But a customer
 * who specifically wants that shade is demand, and silently discarding it
 * throws away the single most actionable signal a dealer can get: a named
 * person who will buy a named colour if it is stocked.
 */
export const shadeRequests = pgTable("shade_requests", {
  id: text("id").primaryKey(),
  dealerId: text("dealer_id").references(() => dealers.id, { onDelete: "cascade" }).notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => customerSessions.id, { onDelete: "cascade" }),
  shadeCode: text("shade_code").notNull(),
  shadeName: text("shade_name").notNull(),
  shadeHex: text("shade_hex").notNull(),
  /** Which producible shade was offered instead, so the dealer sees the near-miss. */
  substituteCode: text("substitute_code"),
  substituteName: text("substitute_name"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  /** OPEN | ORDERED | DECLINED */
  status: text("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
