import { eq, sql } from "drizzle-orm";
import { getDb, type DB } from "./index";
import * as t from "./schema";
import { PRODUCT_LINES, SHADES, DEALER_LINES, shadeAvailable } from "@/lib/catalog";
import { SIGNALS } from "@/lib/demo";
import { hexToLab } from "@/lib/color";
import { hashSecret } from "@/server/hash";
import { seedDealerWorkspace } from "./workspace-seed";

/**
 * Seeds the catalogue and one demo dealer.
 *
 * The catalogue data lives in `lib/catalog.ts` because the recommendation
 * engine needs it synchronously in the browser too. This function is the one
 * place it crosses into the database, so there is a single source of truth
 * rather than two lists drifting apart.
 *
 * Runs once, on an empty database. It never overwrites: a dealer who has
 * corrected his own prices must not have them reset by a redeploy.
 */

const DEALER_ID = "d_sharma_kanpur";

/** Published on the sign-in screen, because a demo nobody can enter is useless. */
export const DEMO_PHONE = "9876543210";
export const DEMO_PASSWORD = "rachna123";

const CATEGORIES = [
  { id: "cat_interior", slug: "interior", name: "Interior emulsion", customerLabel: "Inside walls", description: "Everyday walls and ceilings inside the house." },
  { id: "cat_exterior", slug: "exterior", name: "Exterior paint", customerLabel: "Outside walls", description: "Weather-facing surfaces." },
  { id: "cat_waterproofing", slug: "waterproofing", name: "Waterproofing", customerLabel: "Damp or seepage", description: "For a wall that already shows damp." },
  { id: "cat_primer", slug: "primer", name: "Primer", customerLabel: "Primer", description: "Required over fresh plaster or old distemper." },
  { id: "cat_putty", slug: "putty", name: "Wall putty", customerLabel: "Surface levelling", description: "Levels the surface before anything else." },
  { id: "cat_enamel", slug: "enamel", name: "Enamel", customerLabel: "Doors, grilles & railings", description: "Wood and metal trim." },
];

const brandId = (name: string) => "brand_" + name.toLowerCase().replace(/[^a-z]+/g, "_");

export async function seedIfEmpty(db: DB) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.dealers);
  if (count > 0) return;

  await db.insert(t.dealers).values({
    id: DEALER_ID,
    name: "Sharma Interiors & Hardware",
    owner: "Rakesh Sharma",
    city: "Kanpur",
    pincode: "208011",
    // Real, signable credentials. The demo account has to be enterable the
    // same way any other account is, or the sign-in screen is theatre.
    phone: DEMO_PHONE,
    passwordHash: await hashSecret(DEMO_PASSWORD),
    // Kanpur, so the live weather lookup has coordinates from the first load.
    lat: 26.46523,
    lon: 80.34975,
    tier: "Pro",
  });

  await db.insert(t.users).values({
    id: "u_rakesh",
    dealerId: DEALER_ID,
    name: "Rakesh Sharma",
    phone: "+91 98••• ••100",
    role: "DEALER",
  });

  const brandNames = Array.from(new Set(PRODUCT_LINES.map((p) => p.brand)));
  await db.insert(t.brands).values(
    brandNames.map((name) => ({
      id: brandId(name),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    })),
  );

  await db.insert(t.categories).values(CATEGORIES);

  await db.insert(t.products).values(
    PRODUCT_LINES.map((p) => ({
      id: p.id,
      brandId: brandId(p.brand),
      categoryId: CATEGORIES.find((c) => c.slug === p.category)!.id,
      name: p.name,
      finish: p.finish,
      budgetBand: p.budget,
      mrpPerLitre: p.pricePerLitre,
      coverage: p.coverage,
      packSizes: p.packSizes,
      features: p.features,
      blurb: p.blurb,
    })),
  );

  await db.insert(t.shades).values(
    SHADES.map((s) => {
      const lab = hexToLab(s.hex);
      return {
        code: s.code,
        name: s.name,
        hex: s.hex,
        family: s.family,
        labL: lab.L,
        labA: lab.a,
        labB: lab.b,
        wallSafe: s.wallSafe,
        exteriorSuitable: s.exteriorSuitable,
      };
    }),
  );

  await db.insert(t.inventory).values(
    DEALER_LINES.map((d) => {
      const line = PRODUCT_LINES.find((p) => p.id === d.lineId)!;
      // ASSUMPTION: offtake and lead times below are plausible demo figures.
      // A real dealer's come from his own dispatch history.
      const offtake = Math.max(2, Math.round(d.litres / 22));
      return {
        id: `inv_${d.lineId}`,
        dealerId: DEALER_ID,
        productId: d.lineId,
        litres: d.litres,
        reorderLevel: Math.round(offtake * 3),
        weeklyOfftake: offtake,
        leadTimeDays: line.category === "waterproofing" ? 9 : 5,
        sellingPerLitre: d.sellingPerLitre,
      };
    }),
  );

  await db.insert(t.dealerShades).values(
    SHADES.map((s) => ({
      dealerId: DEALER_ID,
      shadeCode: s.code,
      producible: shadeAvailable(s.code),
      blockedReason: shadeAvailable(s.code) ? null : "Colorant below threshold",
    })),
  );

  await db.insert(t.demandSignals).values(
    SIGNALS.map((s) => ({
      id: `sig_${s.id}`,
      dealerId: DEALER_ID,
      kind: s.kind,
      headline: s.headline,
      reason: s.reason,
      action: s.action,
      categories: s.categories as string[],
      confidence: s.confidence,
      // Labelled honestly (§25): no weather or trend feed is connected yet.
      source: "demo",
    })),
  );

  // The demo dealer gets exactly the same seeded workspace as any new account.
  // Previously its console read hardcoded constants instead, which is what let
  // one shop's customers and revenue appear on another shop's dashboard.
  await seedDealerWorkspace(DEALER_ID, db);
}

/**
 * Open a newly registered dealer's shop with a working catalogue.
 *
 * A dealer who signs up and lands on an empty console cannot do anything at
 * all: the availability filter is absolute, so zero inventory means the
 * recommender returns zero schemes and the customer app has nothing to show.
 * The first five minutes would be a tour of empty screens.
 *
 * So the account opens with the standard product lines at a nominal stock
 * position, which the dealer then corrects from the Inventory screen or a Tally
 * import. These are STARTING figures, not claims about their real shelf, and
 * the Inventory screen is where they become true.
 *
 * Idempotent: it does nothing if the dealer already has stock rows, so a retried
 * sign-up cannot double a shop's inventory.
 */
export async function seedDealerCatalogue(dealerId: string) {
  const db = await getDb();

  const existing = await db
    .select({ id: t.inventory.id })
    .from(t.inventory)
    .where(eq(t.inventory.dealerId, dealerId))
    .limit(1);
  if (existing.length) return;

  await db.insert(t.inventory).values(
    DEALER_LINES.map((d) => {
      const line = PRODUCT_LINES.find((p) => p.id === d.lineId)!;
      const offtake = Math.max(2, Math.round(d.litres / 22));
      return {
        id: `inv_${dealerId}_${d.lineId}`,
        dealerId,
        productId: d.lineId,
        litres: d.litres,
        reorderLevel: Math.round(offtake * 3),
        weeklyOfftake: offtake,
        leadTimeDays: line.category === "waterproofing" ? 9 : 5,
        sellingPerLitre: d.sellingPerLitre,
      };
    }),
  );

  await db.insert(t.demandSignals).values(
    SIGNALS.map((s) => ({
      id: `sig_${dealerId}_${s.id}`,
      dealerId,
      kind: s.kind,
      headline: s.headline,
      reason: s.reason,
      action: s.action,
      categories: s.categories as string[],
      confidence: s.confidence,
      // Labelled honestly: no weather or trend feed is connected to these.
      source: "demo",
    })),
  );

  // A new shop can tint everything. The demo dealer's blocked colorants are a
  // deliberate wrinkle for that one account, not a default every dealer inherits.
  await db.insert(t.dealerShades).values(
    SHADES.map((s) => ({
      dealerId,
      shadeCode: s.code,
      producible: true,
      blockedReason: null,
    })),
  );
}

export { DEALER_ID };
