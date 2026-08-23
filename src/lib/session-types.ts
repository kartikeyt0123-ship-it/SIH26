/**
 * Types shared by the browser and the server.
 *
 * Kept in `lib` rather than next to the database so a client component can
 * import them without dragging PGlite, Drizzle or the filesystem into the
 * browser bundle.
 */

export type Measurements = {
  /** Customer-entered. Never inferred from a photograph. */
  lengthM: number;
  widthM: number;
  heightM: number;
  doors: number;
  windows: number;
  coats: number;
  includeCeiling: boolean;
  featureWall: boolean;
};

export type ShadeRef = { code: string; name: string; hex: string };

export type SelectedScheme = {
  id: string;
  title: string;
  rationale: string;
  lineId: string;
  trimLineId: string | null;
  shades: {
    main: ShadeRef;
    feature: ShadeRef;
    ceiling: ShadeRef;
    trim: ShadeRef;
  };
};

/** Session lifecycle (§5). */
export type SessionStatus =
  | "ACTIVE"
  | "IN_PROGRESS"
  | "DESIGN_SAVED"
  | "SUBMITTED"
  | "EXPIRED"
  | "CLOSED";

/**
 * Round 2 additions to the project payload.
 *
 * All four are nullable and all four default to null, which is what keeps every
 * Round 1 screen working unchanged: a project created before this existed, or
 * one whose customer never opened an intelligence panel, is simply a project
 * with nulls here. Nothing downstream is allowed to require them.
 */
export type ProjectIntelligence = {
  /** SurfaceReport — see lib/surface.ts. */
  surface: Record<string, unknown> | null;
  /** DesignDNA — see lib/dna.ts. Derived, and re-derivable from `signals`. */
  dna: Record<string, unknown> | null;
  /** How many What-If directions the customer explored. */
  variationCount: number;
  /** The last intent they asked for, for the dealer's context. */
  lastIntent: string | null;
  /** ClimateContext the recommendation was made under. */
  climate: Record<string, unknown> | null;
};

export type ProjectDTO = ProjectIntelligence & {
  id: string;
  status: string;
  step: number;
  spec: Record<string, unknown> | null;
  measurements: Record<string, unknown> | null;
  room: Record<string, unknown> | null;
  roomEngine: string | null;
  roomConfidence: string | null;
  images: { id: string; url: string; position: number }[];
  savedDesigns: {
    id: string;
    schemeId: string;
    label: string | null;
    scheme: Record<string, unknown>;
    isChosen: boolean;
  }[];
  quotation: {
    id: string;
    lines: unknown[];
    areas: Record<string, unknown>;
    subtotal: number;
    discountPct: number;
    total: number;
    status: string;
  } | null;
  submittedAt: string | null;
  customerNote: string | null;
};

export type SessionDTO = {
  id: string;
  token: string;
  dealerId: string;
  customerName: string;
  phone: string | null;
  status: string;
  opens: number;
  createdAt: string;
  expiresAt: string;
  hoursLeft: number;
  expired: boolean;
  project: ProjectDTO | null;
  /** Added by the API layer, not stored. */
  url?: string;
};

export const SESSION_LABEL: Record<string, string> = {
  ACTIVE: "active",
  IN_PROGRESS: "in progress",
  DESIGN_SAVED: "design saved",
  SUBMITTED: "received",
  EXPIRED: "expired",
  CLOSED: "closed",
};
