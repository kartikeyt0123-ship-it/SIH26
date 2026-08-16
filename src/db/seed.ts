import { sql } from "drizzle-orm";
import type { DB } from "./index";
import * as t from "./schema";
import { PRODUCT_LINES, SHADES, DEALER_LINES, shadeAvailable } from "@/lib/catalog";
import { SIGNALS } from "@/lib/demo";
import { hexToLab } from "@/lib/color";

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
    phone: "+91 98••• ••100",
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
}

export { DEALER_ID };
