/**
 * The Material Intelligence Graph.
 *
 * Rachna sells paint today. It is a building-material platform in the shape of
 * its data or it is not one at all, so materials are modelled as nodes in a
 * graph with typed edges rather than as a paint catalogue with extras bolted
 * on. Adding tiles, wallpaper or laminate to a live deployment is a row in
 * `NODES` and an edge or two — it is not a change to the recommender.
 *
 * WHAT THE EDGES MEAN, PRECISELY:
 *
 *   requires    — trade sequence. Paint REQUIRES primer. This is not taste; get
 *                 it wrong and the job fails, so these are never suppressed.
 *   pairs-with  — a design convention. Warm paint PAIRS-WITH warm oak flooring.
 *                 This is a convention among people who do this work, not a
 *                 measured property, and it is labelled that way on screen.
 *   alternative — serves the same surface a different way. Wallpaper is an
 *                 ALTERNATIVE to paint on a feature wall.
 *   excludes    — actively wrong together, for a stated reason.
 *
 * WHAT THIS IS NOT: a compatibility test. Nothing here has been measured in a
 * laboratory, and `basis` on every edge says which kind of claim it is so the
 * UI can never present a convention as a tested fact.
 */

import { hexToHsl, hexToLab } from "./color";

/* --------------------------------- nodes ---------------------------------- */

export type MaterialCategory =
  | "paint"
  | "primer"
  | "putty"
  | "waterproofing"
  | "enamel"
  | "wallpaper"
  | "tile"
  | "laminate"
  | "flooring";

/** Where in a room the material lives. Drives how suggestions are grouped. */
export type Placement = "wall" | "accent" | "ceiling" | "trim" | "floor" | "substrate";

export type MaterialNode = {
  id: MaterialCategory;
  label: string;
  placement: Placement[];
  /** True when this dealer's paint catalogue already supplies it. */
  inCatalogue: boolean;
  /** Shown when a category is not yet stocked, instead of a dead end. */
  blurb: string;
};

/**
 * The node table.
 *
 * `inCatalogue` is the honest bit: five of these are real products this dealer
 * stocks and prices today; four are modelled so the graph is complete and so
 * the day a dealer adds tiles the recommendation path already exists. The UI
 * renders the difference — a stocked category is offered, a modelled one is
 * described.
 */
export const NODES: MaterialNode[] = [
  {
    id: "paint",
    label: "Paint",
    placement: ["wall", "accent", "ceiling"],
    inCatalogue: true,
    blurb: "Interior and exterior emulsion, priced and stocked.",
  },
  {
    id: "primer",
    label: "Primer",
    placement: ["substrate"],
    inCatalogue: true,
    blurb: "What the topcoat holds on to.",
  },
  {
    id: "putty",
    label: "Wall putty",
    placement: ["substrate"],
    inCatalogue: true,
    blurb: "Levels the wall before anything else goes on.",
  },
  {
    id: "waterproofing",
    label: "Waterproofing",
    placement: ["substrate", "wall"],
    inCatalogue: true,
    blurb: "For a wall that already shows damp.",
  },
  {
    id: "enamel",
    label: "Enamel",
    placement: ["trim"],
    inCatalogue: true,
    blurb: "Doors, grilles and railings.",
  },
  {
    id: "wallpaper",
    label: "Wallpaper",
    placement: ["accent", "wall"],
    inCatalogue: false,
    blurb: "A textured alternative on the one wall that carries the room.",
  },
  {
    id: "tile",
    label: "Tiles",
    placement: ["floor", "wall"],
    inCatalogue: false,
    blurb: "Floor and splashback. Tone has to sit under the wall colour, not fight it.",
  },
  {
    id: "laminate",
    label: "Mica / laminate",
    placement: ["trim", "wall"],
    inCatalogue: false,
    blurb: "Shutters and built-in furniture faces.",
  },
  {
    id: "flooring",
    label: "Wooden flooring",
    placement: ["floor"],
    inCatalogue: false,
    blurb: "Engineered or laminate plank.",
  },
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/* --------------------------------- edges ---------------------------------- */

export type EdgeKind = "requires" | "pairs-with" | "alternative" | "excludes";

/** What kind of claim the edge is making. The UI renders this verbatim. */
export type EdgeBasis = "trade-sequence" | "design-convention" | "catalogue-rule";

export type MaterialEdge = {
  from: MaterialCategory;
  to: MaterialCategory;
  kind: EdgeKind;
  basis: EdgeBasis;
  /** Plain-language reason. Always shown with the suggestion, never hidden. */
  why: string;
  /** Optional gate: only applies when the predicate holds. */
  when?: (ctx: GraphContext) => boolean;
};

export const EDGES: MaterialEdge[] = [
  {
    from: "paint",
    to: "primer",
    kind: "requires",
    basis: "trade-sequence",
    why: "Emulsion needs a primed surface to bond to. Without it the coat fails early, whatever it cost.",
  },
  {
    from: "primer",
    to: "putty",
    kind: "requires",
    basis: "trade-sequence",
    why: "Primer goes over a levelled wall. Putty first, then primer, then paint.",
  },
  {
    from: "paint",
    to: "waterproofing",
    kind: "requires",
    basis: "trade-sequence",
    why: "Damp is treated before the finish goes on, not after.",
    when: (c) => c.conditions.includes("dampness"),
  },
  {
    from: "paint",
    to: "enamel",
    kind: "pairs-with",
    basis: "trade-sequence",
    why: "Doors, grilles and railings take enamel, not emulsion — different surface, different product.",
  },
  {
    from: "paint",
    to: "wallpaper",
    kind: "alternative",
    basis: "design-convention",
    why: "On the feature wall, a texture can do what a second colour does, without committing the whole room.",
    when: (c) => c.surface === "interior",
  },
  {
    from: "paint",
    to: "tile",
    kind: "pairs-with",
    basis: "design-convention",
    why: "The floor sets the room's temperature. A warm wall over a cool grey floor is the commonest mismatch we see.",
  },
  {
    from: "paint",
    to: "flooring",
    kind: "pairs-with",
    basis: "design-convention",
    why: "Plank tone and wall tone want to agree; the plank is the harder one to change later.",
    when: (c) => c.surface === "interior",
  },
  {
    from: "paint",
    to: "laminate",
    kind: "pairs-with",
    basis: "design-convention",
    why: "Shutter faces sit against the wall all day. Matching their warmth to the wall is what makes built-ins disappear.",
    when: (c) => c.surface === "interior",
  },
  {
    // Direction matters: this removes WALLPAPER when the wall is damp, not
    // waterproofing. `excludes` always suppresses the edge's `to` node.
    from: "waterproofing",
    to: "wallpaper",
    kind: "excludes",
    basis: "trade-sequence",
    why: "Paper over a damp wall lifts. Treat the wall, or use a coating on that surface instead.",
    when: (c) => c.conditions.includes("dampness"),
  },
  {
    from: "tile",
    to: "wallpaper",
    kind: "excludes",
    basis: "design-convention",
    why: "A patterned floor and a patterned wall in one small room read as noise.",
    when: (c) => c.roomSize === "small",
  },
];

/* -------------------------------- context --------------------------------- */

export type GraphContext = {
  surface: "interior" | "exterior";
  conditions: string[];
  roomType: string;
  roomSize: "small" | "medium" | "large";
  budget: string;
  /** The wall colour the customer has landed on. */
  mainHex: string;
  accentHex: string;
  /** Palette family from the Design DNA, when there is one. */
  paletteFamily?: string;
  /** Product line ids the dealer actually has litres of. */
  stockedCategories: Set<string>;
};

export type MaterialSuggestion = {
  category: MaterialCategory;
  label: string;
  placement: Placement;
  /** The concrete recommendation — a tone, a texture, a product family. */
  suggestion: string;
  /** A representative colour, so the customer sees it rather than reads it. */
  hex: string;
  kind: EdgeKind;
  basis: EdgeBasis;
  why: string;
  /** True when the dealer can supply this today. */
  available: boolean;
  /** Shown when unavailable: what the customer should do instead. */
  availabilityNote: string;
};

/* ------------------------------ tone matching ----------------------------- */

/**
 * A companion tone for a hard material.
 *
 * The rule underneath: floors and shutters carry the room's temperature and
 * should sit DARKER than the wall — a floor lighter than the wall makes a room
 * feel like it is floating, which almost nobody is asking for. So the hue is
 * borrowed from the wall, the saturation is pulled down towards something a
 * manufacturer actually makes, and the lightness is dropped by a fixed margin.
 */
function companionTone(mainHex: string, drop: number, warmthBias: number) {
  const { h, s } = hexToHsl(mainHex);
  const { L } = hexToLab(mainHex);
  const targetL = Math.max(22, L - drop);
  const targetS = Math.min(38, Math.max(8, s * 0.8 + warmthBias));
  return hslToHex(h, targetS, targetL * 0.92);
}

function hslToHex(h: number, s: number, l: number) {
  const S = s / 100;
  const L = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg] ?? [c, x, 0];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Named tone families, so a suggestion reads as a product not a hex code. */
function floorName(mainHex: string) {
  const { h, s } = hexToHsl(mainHex);
  if (s < 10) return "Warm oak, to stop the room reading flat";
  if (h < 45 || h >= 330) return "Warm oak or a terracotta-toned vitrified tile";
  if (h < 70) return "Honey oak, or a sand-toned matt tile";
  if (h < 170) return "Smoked oak — keeps the green from turning minty";
  return "Grey-brown oak, or a stone-effect tile";
}

function laminateName(mainHex: string) {
  const { s } = hexToHsl(mainHex);
  return s < 12
    ? "Woodgrain in a mid tone — the neutral wall needs the grain to carry it"
    : "A quieter matt laminate, half a step darker than the wall";
}

function wallpaperName(mainHex: string) {
  const { L } = hexToLab(mainHex);
  return L > 74
    ? "A subtle woven texture in the same family — pattern you feel rather than see"
    : "A fine linen texture, tonal rather than contrasting";
}

/* ------------------------------ the traversal ----------------------------- */

/**
 * Walk the graph out from paint and return what else this room wants.
 *
 * Deterministic and ordered: required steps first (they are not optional),
 * then conventions, then alternatives. Exclusions are applied last and remove
 * suggestions rather than merely warning about them, because a suggestion the
 * customer must not act on should not be on the screen at all.
 */
export function companionMaterials(ctx: GraphContext): MaterialSuggestion[] {
  const out: MaterialSuggestion[] = [];
  const excluded = new Set<MaterialCategory>();

  for (const e of EDGES) {
    if (e.kind !== "excludes") continue;
    if (e.when && !e.when(ctx)) continue;
    excluded.add(e.to);
  }

  const push = (
    edge: MaterialEdge,
    detail: { suggestion: string; hex: string; placement: Placement },
  ) => {
    const node = NODE_BY_ID.get(edge.to);
    if (!node || excluded.has(edge.to)) return;
    const available = node.inCatalogue && ctx.stockedCategories.has(edge.to);
    out.push({
      category: edge.to,
      label: node.label,
      placement: detail.placement,
      suggestion: detail.suggestion,
      hex: detail.hex,
      kind: edge.kind,
      basis: edge.basis,
      why: edge.why,
      available,
      availabilityNote: available
        ? "Available from your dealer today."
        : node.inCatalogue
          ? "Your dealer stocks this category but not this line right now — ask at the counter."
          : "Not part of your dealer's catalogue yet. Shown so the scheme is complete.",
    });
  };

  // A real walk out from paint, not a single hop. Paint requires primer, primer
  // requires putty — and putty only appears at all because the traversal keeps
  // following edges from nodes it has already reached. Adding a material later
  // means adding a node and an edge; this loop does not change.
  const reached = new Set<MaterialCategory>(["paint"]);
  const queue: MaterialCategory[] = ["paint"];
  const walked: MaterialEdge[] = [];

  while (queue.length) {
    const from = queue.shift()!;
    for (const e of EDGES) {
      if (e.from !== from || e.kind === "excludes") continue;
      if (e.when && !e.when(ctx)) continue;
      walked.push(e);
      if (!reached.has(e.to)) {
        reached.add(e.to);
        queue.push(e.to);
      }
    }
  }

  for (const e of walked) {
    switch (e.to) {
      case "primer":
        push(e, { suggestion: "Interior/exterior primer to match the topcoat", hex: "#e8e4db", placement: "substrate" });
        break;
      case "putty":
        push(e, { suggestion: "Two thin coats, sanded flat", hex: "#f0ece2", placement: "substrate" });
        break;
      case "paint":
        break;
      case "enamel":
        push(e, {
          suggestion: `Trim in ${ctx.accentHex.toUpperCase()} or a half-tone deeper`,
          hex: ctx.accentHex,
          placement: "trim",
        });
        break;
      case "wallpaper":
        push(e, {
          suggestion: wallpaperName(ctx.mainHex),
          hex: companionTone(ctx.mainHex, 8, 2),
          placement: "accent",
        });
        break;
      case "tile":
        push(e, {
          suggestion: floorName(ctx.mainHex),
          hex: companionTone(ctx.mainHex, 34, 6),
          placement: "floor",
        });
        break;
      case "flooring":
        push(e, {
          suggestion: floorName(ctx.mainHex),
          hex: companionTone(ctx.mainHex, 40, 10),
          placement: "floor",
        });
        break;
      case "laminate":
        push(e, {
          suggestion: laminateName(ctx.mainHex),
          hex: companionTone(ctx.mainHex, 26, 8),
          placement: "trim",
        });
        break;
      case "waterproofing":
        push(e, {
          suggestion: "Treat the affected wall before the finish coat",
          hex: "#cfd8d4",
          placement: "substrate",
        });
        break;
    }
  }

  // Required first, then conventions, then alternatives. Within a kind, the
  // ones the dealer can actually supply come first — a suggestion that can be
  // acted on today is worth more than one that cannot.
  const order: Record<EdgeKind, number> = { requires: 0, "pairs-with": 1, alternative: 2, excludes: 3 };
  return out
    .sort((a, b) => order[a.kind] - order[b.kind] || Number(b.available) - Number(a.available));
}

/**
 * De-duplicated view for the customer, grouped by where it goes in the room.
 *
 * Floor, wall, accent, trim — the four places a person actually looks. The
 * substrate steps are deliberately excluded here; they belong in the surface
 * prep plan, and repeating them as design choices invites the customer to treat
 * them as optional.
 */
export function groupForCustomer(list: MaterialSuggestion[]) {
  const wanted: Placement[] = ["wall", "accent", "floor", "trim"];
  const groups = wanted.map((p) => ({
    placement: p,
    items: list.filter((s) => s.placement === p),
  }));
  return groups.filter((g) => g.items.length > 0);
}

export const PLACEMENT_LABEL: Record<Placement, string> = {
  wall: "Walls",
  accent: "Accent",
  ceiling: "Ceiling",
  trim: "Trim & shutters",
  floor: "Floor",
  substrate: "Under the paint",
};

export const BASIS_LABEL: Record<EdgeBasis, string> = {
  "trade-sequence": "Required sequence",
  "design-convention": "Design convention",
  "catalogue-rule": "Catalogue rule",
};

export const MATERIAL_ENGINE = "material-graph-v1";
