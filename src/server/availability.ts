import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import type { Availability } from "@/lib/recommend";

/**
 * What this dealer can actually sell, read from the database.
 *
 * This is the single most important query in the product. Everything the
 * customer is offered is filtered through it, so a line with no litres on the
 * shelf and a shade whose colorant has run out simply do not exist as far as
 * the recommendation engine is concerned.
 */
export async function dealerAvailability(dealerId: string): Promise<Availability> {
  const db = await getDb();

  const [stock, producible] = await Promise.all([
    db
      .select({ productId: t.inventory.productId })
      .from(t.inventory)
      .where(and(eq(t.inventory.dealerId, dealerId), gt(t.inventory.litres, 0))),
    db
      .select({ code: t.dealerShades.shadeCode })
      .from(t.dealerShades)
      .where(and(eq(t.dealerShades.dealerId, dealerId), eq(t.dealerShades.producible, true))),
  ]);

  return {
    stockedLineIds: new Set(stock.map((s) => s.productId)),
    producibleShades: new Set(producible.map((s) => s.code)),
  };
}

/** The brands and categories a customer may choose between (§8, §9). */
export async function dealerCatalogue(dealerId: string) {
  const db = await getDb();

  const rows = await db
    .select({
      productId: t.products.id,
      productName: t.products.name,
      finish: t.products.finish,
      budget: t.products.budgetBand,
      brand: t.brands.name,
      categorySlug: t.categories.slug,
      categoryLabel: t.categories.customerLabel,
      categoryName: t.categories.name,
      litres: t.inventory.litres,
    })
    .from(t.inventory)
    .innerJoin(t.products, eq(t.inventory.productId, t.products.id))
    .innerJoin(t.brands, eq(t.products.brandId, t.brands.id))
    .innerJoin(t.categories, eq(t.products.categoryId, t.categories.id))
    .where(and(eq(t.inventory.dealerId, dealerId), gt(t.inventory.litres, 0)));

  const brands = Array.from(new Set(rows.map((r) => r.brand))).sort();

  // Only the categories a customer would choose between. Primer and putty are
  // real products but they are prescribed by the diagnosis, never picked from a
  // menu — offering them here would invite the customer to skip them.
  const CUSTOMER_FACING = ["interior", "exterior", "waterproofing", "enamel"];
  const categories = Array.from(
    new Map(
      rows
        .filter((r) => CUSTOMER_FACING.includes(r.categorySlug))
        .map((r) => [r.categorySlug, { slug: r.categorySlug, label: r.categoryLabel, name: r.categoryName }]),
    ).values(),
  );

  /**
   * Every catalogue shade, each carrying whether this dealer can mix it.
   *
   * Previously this returned only producible shades, which made unavailable
   * colours invisible rather than unavailable. Invisible is the wrong answer:
   * a customer who wants a colour they cannot see simply leaves, and the dealer
   * never learns the colour existed. Returning the whole set with a flag lets
   * the app show the swatch, refuse to put it on a wall, offer the nearest
   * thing that can be mixed, and capture the request.
   *
   * The recommender is unaffected — it filters on `dealerAvailability`, not on
   * this, so nothing unavailable can enter a recommended scheme.
   */
  const shadeRows = await db
    .select({
      code: t.shades.code,
      name: t.shades.name,
      hex: t.shades.hex,
      family: t.shades.family,
      wallSafe: t.shades.wallSafe,
      exteriorSuitable: t.shades.exteriorSuitable,
      producible: t.dealerShades.producible,
      blockedReason: t.dealerShades.blockedReason,
    })
    .from(t.shades)
    .leftJoin(
      t.dealerShades,
      and(eq(t.dealerShades.shadeCode, t.shades.code), eq(t.dealerShades.dealerId, dealerId)),
    );

  const shades = shadeRows.map((s) => ({
    code: s.code,
    name: s.name,
    hex: s.hex,
    family: s.family,
    wallSafe: s.wallSafe,
    exteriorSuitable: s.exteriorSuitable,
    // A shade with no row for this dealer has never been assessed, and an
    // unassessed shade must not be offered as mixable.
    available: s.producible === true,
    blockedReason: s.blockedReason,
  }));

  return { brands, categories, shades, productCount: rows.length };
}
