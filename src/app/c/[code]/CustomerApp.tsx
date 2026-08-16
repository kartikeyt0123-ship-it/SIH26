"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import {
  AVAILABLE_SHADES,
  DEALER_BRANDS,
  type Budget,
  type Finish,
  type Shade,
} from "@/lib/catalog";
import { deltaBand } from "@/lib/color";
import { recommendSchemes, type CustomerSpec, type Scheme } from "@/lib/recommend";
import { buildQuote, computeAreas } from "@/lib/quote";
import {
  formatRemaining,
  useSession,
  type Measurements,
  type SelectedScheme,
} from "@/lib/store";
import { analyzeRoomPhotos, fileToThumbnail, strongestTone, type RoomModel } from "@/lib/vision";
import { cn, inr } from "@/lib/utils";

// The viewer pulls in three.js; a customer on a counter phone should not
// download it until there is actually a room to show.
const RoomViewer = dynamic(
  () => import("@/components/three/RoomViewer").then((m) => m.RoomViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[0.8125rem] text-paper-400">
        Preparing your room…
      </div>
    ),
  },
);

const STEPS = ["Start", "Your needs", "Photos", "Your room", "Colours", "Size", "Send"];

const DEFAULT_SPEC: CustomerSpec = {
  surface: "interior",
  waterproofing: false,
  budget: "mid",
  brands: [],
  finish: "any",
  mood: "any",
  roomType: "Living room",
  condition: [],
};

const DEFAULT_MEASURE: Measurements = {
  lengthM: 4.2,
  widthM: 3.6,
  heightM: 3,
  doors: 1,
  windows: 2,
  coats: 2,
  includeCeiling: true,
  featureWall: true,
};

type Roles = "main" | "feature" | "ceiling" | "trim";

export function CustomerApp({ code }: { code: string }) {
  const { session, ready, patch } = useSession(code);

  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState<CustomerSpec>(DEFAULT_SPEC);
  const [photos, setPhotos] = useState<string[]>([]);
  const [room, setRoom] = useState<RoomModel | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [schemeId, setSchemeId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<Roles, Shade>>>({});
  const [measure, setMeasure] = useState<Measurements>(DEFAULT_MEASURE);
  const [note, setNote] = useState("");
  const hydrated = useRef(false);

  /* ---- rehydrate whatever the customer already did on a previous visit ---- */
  useEffect(() => {
    if (!ready || !session || hydrated.current) return;
    hydrated.current = true;
    if (session.spec) setSpec(session.spec);
    if (session.photos?.length) setPhotos(session.photos);
    if (session.room) setRoom(session.room);
    if (session.measurements) setMeasure(session.measurements);
    if (session.scheme) setSchemeId(session.scheme.id);
    if (session.status === "submitted" || session.status === "quoted") setStep(6);
    else if (session.step) setStep(Math.min(session.step, 5));
    patch({ opens: (session.opens ?? 0) + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session]);

  const photoAnchor = room ? strongestTone(room) : undefined;

  const schemes = useMemo(
    () => recommendSchemes(spec, { photoHex: photoAnchor, limit: 5 }),
    [spec, photoAnchor],
  );

  const activeScheme: Scheme | undefined =
    schemes.find((s) => s.id === schemeId) ?? schemes[0];

  const colors = useMemo(() => {
    const base = activeScheme?.shades;
    return {
      main: (overrides.main ?? base?.main)?.hex ?? "#e7dcc7",
      feature: (overrides.feature ?? base?.feature)?.hex ?? "#4f8079",
      ceiling: (overrides.ceiling ?? base?.ceiling)?.hex ?? "#f4f1ea",
      trim: (overrides.trim ?? base?.trim)?.hex ?? "#6d6a63",
    };
  }, [activeScheme, overrides]);

  const finalShades = useMemo(() => {
    if (!activeScheme) return null;
    const pick = (r: Roles) => overrides[r] ?? activeScheme.shades[r];
    return {
      main: pick("main"),
      feature: pick("feature"),
      ceiling: pick("ceiling"),
      trim: pick("trim"),
    };
  }, [activeScheme, overrides]);

  const selected: SelectedScheme | null =
    activeScheme && finalShades
      ? {
          id: activeScheme.id,
          title: activeScheme.title,
          rationale: activeScheme.rationale,
          lineId: activeScheme.line.id,
          trimLineId: activeScheme.trimLine?.id ?? null,
          shades: {
            main: slim(finalShades.main),
            feature: slim(finalShades.feature),
            ceiling: slim(finalShades.ceiling),
            trim: slim(finalShades.trim),
          },
        }
      : null;

  const quote = useMemo(
    () => (selected ? buildQuote(spec, selected, measure) : null),
    [selected, spec, measure],
  );

  /* -------------------------------- guards -------------------------------- */

  if (!ready) return <Splash>Opening your session…</Splash>;
  if (!session)
    return (
      <Splash>
        <p className="text-paper-50">We could not find session {code}.</p>
        <p className="mt-2 text-[0.875rem] text-paper-400">
          Ask your dealer to issue a new code.
        </p>
        <Link href="/c" className="mt-6 text-[0.875rem] text-pigment-soft underline underline-offset-4">
          Try another code
        </Link>
      </Splash>
    );
  if (session.status === "expired")
    return (
      <Splash>
        <p className="text-paper-50">This session has expired.</p>
        <p className="mt-2 max-w-xs text-[0.875rem] text-paper-400">
          Codes stay open for up to three days so prices and stock stay honest. Your dealer
          can issue a fresh one in a moment.
        </p>
      </Splash>
    );

  /* ------------------------------- handlers ------------------------------- */

  const goto = (n: number) => {
    setStep(n);
    patch({ step: n, status: session.status === "issued" ? "in_progress" : session.status });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = Array.from(files).slice(0, 3 - photos.length);
    const thumbs = await Promise.all(room.map((f) => fileToThumbnail(f).catch(() => null)));
    const next = [...photos, ...thumbs.filter(Boolean) as string[]].slice(0, 3);
    setPhotos(next);
    patch({ photos: next });
  };

  const runAnalysis = async () => {
    setAnalysing(true);
    goto(3);
    // A visible beat: the customer just uploaded photographs and needs to see
    // that something is being done with them.
    const [model] = await Promise.all([
      analyzeRoomPhotos(photos),
      new Promise((r) => setTimeout(r, 900)),
    ]);
    setRoom(model);
    patch({ room: model, spec });
    setAnalysing(false);
  };

  const submit = () => {
    if (!selected || !quote) return;
    patch({
      status: "submitted",
      spec,
      scheme: selected,
      measurements: measure,
      submittedAt: Date.now(),
      quoteTotal: quote.subtotal,
      customerNote: note.trim() || undefined,
      step: 6,
    });
    setStep(6);
    window.scrollTo({ top: 0 });
  };

  /* --------------------------------- view --------------------------------- */

  return (
    <div className="min-h-[100svh] bg-ink-900 pb-28">
      <header className="sticky top-0 z-30 border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2 text-[0.95rem]">
            <LogoMark className="h-5 w-5" />
            <Wordmark />
          </span>
          <span className="data text-[0.625rem] tracking-[0.1em] text-paper-400 uppercase">
            {session.code} · {formatRemaining(session)} left
          </span>
        </div>
        {session.status !== "submitted" && (
          <div className="mx-auto flex max-w-2xl gap-1 px-5 pb-3">
            {STEPS.map((s, i) => (
              <span key={s} className="flex-1">
                <span
                  className={cn(
                    "block h-[3px] rounded-full transition-colors duration-500",
                    i <= step ? "bg-pigment" : "bg-ink-700",
                  )}
                />
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {step === 0 && (
          <Welcome session={session} onNext={() => goto(1)} />
        )}

        {step === 1 && (
          <Questions
            spec={spec}
            setSpec={(s) => {
              setSpec(s);
              patch({ spec: s });
            }}
            onNext={() => goto(2)}
          />
        )}

        {step === 2 && (
          <PhotoStep
            photos={photos}
            onAdd={addPhotos}
            onRemove={(i) => {
              const next = photos.filter((_, j) => j !== i);
              setPhotos(next);
              patch({ photos: next });
            }}
            onBack={() => goto(1)}
            onNext={runAnalysis}
          />
        )}

        {step === 3 && (
          <RoomStep
            analysing={analysing}
            room={room}
            photos={photos}
            onBack={() => goto(2)}
            onRedo={runAnalysis}
            onNext={() => goto(4)}
          />
        )}

        {step === 4 && room && (
          <ColourStep
            room={room}
            schemes={schemes}
            activeScheme={activeScheme}
            colors={colors}
            overrides={overrides}
            setOverrides={setOverrides}
            onPick={(id) => {
              setSchemeId(id);
              setOverrides({});
            }}
            spec={spec}
            onBack={() => goto(3)}
            onNext={() => goto(5)}
          />
        )}

        {step === 5 && (
          <MeasureStep
            measure={measure}
            setMeasure={(m) => {
              setMeasure(m);
              patch({ measurements: m });
            }}
            note={note}
            setNote={setNote}
            quote={quote}
            colors={colors}
            onBack={() => goto(4)}
            onSubmit={submit}
          />
        )}

        {step === 6 && <Done session={session} />}
      </main>
    </div>
  );
}

const slim = (s: Shade) => ({ code: s.code, name: s.name, hex: s.hex });

/* ============================== step screens ============================== */

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-8 text-center">
      <LogoMark className="mb-6 h-8 w-8" />
      <div className="text-[0.9375rem] text-paper-300">{children}</div>
    </div>
  );
}

function Welcome({ session, onNext }: { session: { customerName: string }; onNext: () => void }) {
  return (
    <div>
      <span className="eyebrow">Sharma Interiors & Hardware</span>
      <h1 className="display mt-3 text-[2.4rem] leading-[1.05]">
        Let’s see it on your own walls.
      </h1>
      <p className="mt-4 text-[1rem] leading-relaxed text-paper-300">
        Five short questions, two or three photographs of the room, and you will get colour
        combinations that your dealer can actually supply — with a price you can check.
      </p>

      <ol className="mt-8 flex flex-col gap-3">
        {[
          ["Tell us what the room needs", "Type of paint, budget, brand if you have a preference."],
          ["Photograph the space", "Two or three pictures from different corners."],
          ["We rebuild the room", "So you can see colours on your walls, not on a card."],
          ["Choose and send", "Your dealer gets the design and prices it."],
        ].map(([t, b], i) => (
          <li key={t} className="flex gap-4 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
            <span className="data text-[0.75rem] text-pigment">0{i + 1}</span>
            <span>
              <span className="block text-[0.9375rem] text-paper-50">{t}</span>
              <span className="mt-1 block text-[0.8125rem] text-paper-400">{b}</span>
            </span>
          </li>
        ))}
      </ol>

      <Next onClick={onNext} className="mt-8">
        Start · {session.customerName.split(" ")[0]}
      </Next>
    </div>
  );
}

function Questions({
  spec,
  setSpec,
  onNext,
}: {
  spec: CustomerSpec;
  setSpec: (s: CustomerSpec) => void;
  onNext: () => void;
}) {
  const set = <K extends keyof CustomerSpec>(k: K, v: CustomerSpec[K]) =>
    setSpec({ ...spec, [k]: v });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Step 1 of 5</span>
        <h1 className="display mt-3 text-[2rem]">What does the room need?</h1>
      </div>

      <Q label="Where is the wall?">
        <Choice
          options={[
            { v: "interior", l: "Inside" },
            { v: "exterior", l: "Outside" },
          ]}
          value={spec.surface}
          onChange={(v) => set("surface", v as CustomerSpec["surface"])}
        />
      </Q>

      <Q label="Is there damp, seepage or peeling?" hint="This decides the primer, and it is not optional if the answer is yes.">
        <Choice
          options={[
            { v: "no", l: "No" },
            { v: "yes", l: "Yes" },
            { v: "unsure", l: "Not sure" },
          ]}
          value={spec.waterproofing ? "yes" : spec.condition.includes("unsure") ? "unsure" : "no"}
          onChange={(v) =>
            setSpec({
              ...spec,
              waterproofing: v === "yes",
              condition: v === "yes" ? ["dampness"] : v === "unsure" ? ["unsure"] : [],
            })
          }
        />
      </Q>

      <Q label="Your budget">
        <Choice
          options={[
            { v: "economy", l: "Economical" },
            { v: "mid", l: "Middle" },
            { v: "premium", l: "Premium" },
          ]}
          value={spec.budget}
          onChange={(v) => set("budget", v as Budget)}
        />
      </Q>

      <Q label="Any brand preference?" hint="Only brands your dealer stocks are shown. Leave it blank if you don’t mind.">
        <div className="flex flex-wrap gap-2">
          {DEALER_BRANDS.map((b) => {
            const on = spec.brands.includes(b);
            return (
              <button
                key={b}
                onClick={() =>
                  set("brands", on ? spec.brands.filter((x) => x !== b) : [...spec.brands, b])
                }
                className={cn(
                  "rounded-full border px-4 py-2.5 text-[0.875rem] transition-colors duration-200",
                  on
                    ? "border-transparent bg-paper-50 text-ink-900"
                    : "border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] text-paper-300",
                )}
              >
                {b}
              </button>
            );
          })}
        </div>
      </Q>

      <Q label="What feeling are you after?">
        <Choice
          options={[
            { v: "any", l: "Show me" },
            { v: "warm", l: "Warm" },
            { v: "cool", l: "Cool" },
            { v: "neutral", l: "Quiet" },
            { v: "bold", l: "Bold" },
          ]}
          value={spec.mood}
          onChange={(v) => set("mood", v as CustomerSpec["mood"])}
        />
      </Q>

      <Q label="Finish">
        <Choice
          options={[
            { v: "any", l: "Either" },
            { v: "matt", l: "Matt" },
            { v: "soft-sheen", l: "Soft sheen" },
          ]}
          value={spec.finish}
          onChange={(v) => set("finish", v as Finish | "any")}
        />
      </Q>

      <Q label="Which room?">
        <Choice
          options={["Living room", "Bedroom", "Kitchen", "Bathroom", "Exterior"].map((r) => ({
            v: r,
            l: r,
          }))}
          value={spec.roomType}
          onChange={(v) => set("roomType", v)}
        />
      </Q>

      <Next onClick={onNext} className="mt-4">
        Next · photographs
      </Next>
    </div>
  );
}

function PhotoStep({
  photos,
  onAdd,
  onRemove,
  onBack,
  onNext,
}: {
  photos: string[];
  onAdd: (f: FileList | null) => void;
  onRemove: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <span className="eyebrow">Step 2 of 5</span>
      <h1 className="display mt-3 text-[2rem]">Photograph the room.</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-paper-300">
        Two or three pictures, from different corners, with as much of the wall and floor in
        frame as you can manage. Daylight helps.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {photos.map((p, i) => (
          <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Room ${i + 1}`} className="h-full w-full object-cover" />
            <button
              onClick={() => onRemove(i)}
              aria-label="Remove"
              className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900/80 text-paper-100"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        ))}

        {photos.length < 3 && (
          <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_22%,transparent)] text-paper-400 transition-colors hover:border-[color-mix(in_oklab,var(--color-pigment)_50%,transparent)] hover:text-paper-200">
            <Camera className="h-5 w-5" strokeWidth={1.5} />
            <span className="text-[0.6875rem]">Add photo</span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => onAdd(e.target.files)}
            />
          </label>
        )}
      </div>

      <p className="mt-5 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4 text-[0.8125rem] leading-relaxed text-paper-400">
        Your photographs are processed on this phone and stored with your session only. They
        are used to rebuild the room’s proportions and read the tones already in it — not to
        measure it. You will enter the size yourself in a moment.
      </p>

      <div className="mt-6 flex gap-3">
        <Back onClick={onBack} />
        <Next onClick={onNext} disabled={photos.length === 0} className="flex-1">
          {photos.length === 0 ? "Add at least one photo" : "Build my room"}
        </Next>
      </div>
    </div>
  );
}

function RoomStep({
  analysing,
  room,
  photos,
  onBack,
  onRedo,
  onNext,
}: {
  analysing: boolean;
  room: RoomModel | null;
  photos: string[];
  onBack: () => void;
  onRedo: () => void;
  onNext: () => void;
}) {
  if (analysing || !room)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-pigment" strokeWidth={1.6} />
        <div>
          <p className="text-[1rem] text-paper-50">Reading your photographs…</p>
          <p className="mt-2 text-[0.8125rem] text-paper-400">
            Finding the floor line, the light and the tones already in the room.
          </p>
        </div>
      </div>
    );

  return (
    <div>
      <span className="eyebrow">Step 3 of 5</span>
      <h1 className="display mt-3 text-[2rem]">Here is your room.</h1>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={p} alt="" className="aspect-[3/4] w-full rounded-lg object-cover opacity-70" />
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        {[
          ["Estimated width", `${room.widthM.toFixed(1)} m`],
          ["Ceiling assumed", `${room.heightM.toFixed(1)} m`],
          ["Light from", room.windowSide === "none" ? "even, no strong source" : `the ${room.windowSide}`],
          ["Existing tones", room.lightWarmth > 0.15 ? "warm" : room.lightWarmth < -0.15 ? "cool" : "neutral"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-3">
            <dt className="eyebrow">{k}</dt>
            <dd className="data mt-1 text-[0.9375rem] text-paper-50">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <span className="eyebrow">Colours already in the room</span>
        <div className="mt-2 flex gap-2">
          {room.palette.map((p) => (
            <span
              key={p.hex}
              style={{ background: p.hex, flexGrow: Math.max(1, p.share * 10) }}
              className="h-10 rounded-lg"
              title={`${p.hex} · ${Math.round(p.share * 100)}%`}
            />
          ))}
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
        {room.notes.map((n) => (
          <li key={n} className="text-[0.8125rem] leading-relaxed text-paper-400">
            {n}
          </li>
        ))}
        <li className="text-[0.8125rem] leading-relaxed text-paper-300">
          This is a reconstruction from your photographs, not a survey. Confidence:{" "}
          {room.confidence}.
        </li>
      </ul>

      <div className="mt-6 flex gap-3">
        <Back onClick={onBack} />
        <button
          onClick={onRedo}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-paper-300"
          aria-label="Rebuild"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.6} />
        </button>
        <Next onClick={onNext} className="flex-1">
          Choose colours
        </Next>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<Roles, string> = {
  main: "Main walls",
  feature: "Feature wall",
  ceiling: "Ceiling",
  trim: "Doors & frames",
};

function ColourStep({
  room,
  schemes,
  activeScheme,
  colors,
  overrides,
  setOverrides,
  onPick,
  spec,
  onBack,
  onNext,
}: {
  room: RoomModel;
  schemes: Scheme[];
  activeScheme?: Scheme;
  colors: { main: string; feature: string; ceiling: string; trim: string };
  overrides: Partial<Record<Roles, Shade>>;
  setOverrides: (o: Partial<Record<Roles, Shade>>) => void;
  onPick: (id: string) => void;
  spec: CustomerSpec;
  onBack: () => void;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState<Roles | null>(null);

  const pool = useMemo(
    () =>
      AVAILABLE_SHADES.filter((s) =>
        spec.surface === "exterior" ? s.exteriorSuitable : true,
      ),
    [spec.surface],
  );

  if (!activeScheme)
    return (
      <div className="py-16 text-center">
        <p className="text-paper-50">No combination fits those answers and this dealer’s stock.</p>
        <p className="mt-2 text-[0.875rem] text-paper-400">
          Try removing the brand preference, or widening the budget.
        </p>
        <Back onClick={onBack} className="mx-auto mt-6" />
      </div>
    );

  return (
    <div>
      <span className="eyebrow">Step 4 of 5</span>
      <h1 className="display mt-3 text-[2rem]">Try them on the walls.</h1>
      <p className="mt-2 text-[0.875rem] text-paper-400">
        Drag to look around. Every combination below is producible at this dealer today.
      </p>

      <div className="relative mt-5 aspect-[4/5] overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] sm:aspect-[4/3]">
        <RoomViewer room={room} colors={colors} className="h-full w-full" />
        <span className="data pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink-900/70 px-3 py-1.5 text-[0.5625rem] tracking-[0.12em] text-paper-300 uppercase">
          Reconstruction · drag to look around
        </span>
      </div>

      {/* per-surface swatches */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(Object.keys(ROLE_LABEL) as Roles[]).map((r) => {
          const shade = overrides[r] ?? activeScheme.shades[r];
          return (
            <button
              key={r}
              onClick={() => setEditing(editing === r ? null : r)}
              className={cn(
                "rounded-xl border p-2 text-left transition-colors duration-200",
                editing === r
                  ? "border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)]",
              )}
            >
              <span
                style={{ background: shade.hex }}
                className="block h-8 w-full rounded-md ring-1 ring-white/10"
              />
              <span className="mt-1.5 block text-[0.625rem] leading-tight text-paper-400">
                {ROLE_LABEL[r]}
              </span>
              <span className="block truncate text-[0.6875rem] text-paper-100">{shade.name}</span>
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="mt-3 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Change {ROLE_LABEL[editing].toLowerCase()}</span>
            <button onClick={() => setEditing(null)} className="text-paper-400">
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-9">
            {pool.map((s) => {
              const current = overrides[editing] ?? activeScheme.shades[editing];
              const on = s.code === current.code;
              return (
                <button
                  key={s.code}
                  onClick={() => setOverrides({ ...overrides, [editing]: s })}
                  title={`${s.name} · ${s.code}`}
                  style={{ background: s.hex }}
                  className={cn(
                    "aspect-square rounded-lg ring-1 transition-transform duration-200",
                    on ? "scale-110 ring-2 ring-paper-50" : "ring-white/10 hover:scale-105",
                  )}
                />
              );
            })}
          </div>
          <p className="mt-3 text-[0.75rem] text-paper-400">
            Every swatch here is one this dealer can produce today. Shades he cannot tint are
            not shown at all.
          </p>
          {Object.keys(overrides).length > 0 && (
            <button
              onClick={() => setOverrides({})}
              className="mt-3 text-[0.75rem] text-pigment-soft underline underline-offset-4"
            >
              Reset to the suggested combination
            </button>
          )}
        </div>
      )}

      {/* schemes */}
      <div className="mt-7">
        <span className="eyebrow flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-pigment" strokeWidth={1.8} />
          Suggested for your room
        </span>
        <div className="mt-3 flex flex-col gap-3">
          {schemes.map((s) => {
            const on = s.id === activeScheme.id;
            const dE = s.photoDelta;
            return (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors duration-300",
                  on
                    ? "border-[color-mix(in_oklab,var(--color-pigment)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_7%,transparent)]"
                    : "border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)]",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex shrink-0 gap-1">
                    {(["main", "feature", "ceiling", "trim"] as Roles[]).map((r) => (
                      <span
                        key={r}
                        style={{ background: s.shades[r].hex }}
                        className="h-9 w-4 rounded-sm ring-1 ring-white/10"
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[0.9375rem] text-paper-50">{s.title}</span>
                      {on && <Check className="h-3.5 w-3.5 text-pigment" strokeWidth={2.4} />}
                    </span>
                    <span className="data mt-0.5 block text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      {s.line.brand} {s.line.name} · {s.approach}
                    </span>
                  </span>
                </div>
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-paper-300">
                  {s.rationale}
                </p>
                {dE !== undefined && (
                  <p className="data mt-2 text-[0.625rem] tracking-[0.06em] text-paper-400">
                    ΔE {dE.toFixed(1)} from the tone already in your photographs —{" "}
                    {deltaBand(dE)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-7 flex gap-3">
        <Back onClick={onBack} />
        <Next onClick={onNext} className="flex-1">
          Next · size of the room
        </Next>
      </div>
    </div>
  );
}

function MeasureStep({
  measure,
  setMeasure,
  note,
  setNote,
  quote,
  colors,
  onBack,
  onSubmit,
}: {
  measure: Measurements;
  setMeasure: (m: Measurements) => void;
  note: string;
  setNote: (s: string) => void;
  quote: ReturnType<typeof buildQuote> | null;
  colors: { main: string; feature: string; ceiling: string; trim: string };
  onBack: () => void;
  onSubmit: () => void;
}) {
  const areas = computeAreas(measure);
  const set = <K extends keyof Measurements>(k: K, v: Measurements[K]) =>
    setMeasure({ ...measure, [k]: v });

  return (
    <div>
      <span className="eyebrow">Step 5 of 5</span>
      <h1 className="display mt-3 text-[2rem]">How big is the room?</h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-paper-400">
        We do not measure this from your photographs — an estimate from an uncalibrated
        picture would put the whole quotation out. Pace it out or use a tape; approximate is
        fine.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <NumField label="Length (m)" value={measure.lengthM} step={0.1} onChange={(v) => set("lengthM", v)} />
        <NumField label="Width (m)" value={measure.widthM} step={0.1} onChange={(v) => set("widthM", v)} />
        <NumField label="Height (m)" value={measure.heightM} step={0.1} onChange={(v) => set("heightM", v)} />
        <NumField label="Doors" value={measure.doors} step={1} onChange={(v) => set("doors", v)} />
        <NumField label="Windows" value={measure.windows} step={1} onChange={(v) => set("windows", v)} />
        <NumField label="Coats" value={measure.coats} step={1} min={1} max={3} onChange={(v) => set("coats", v)} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Toggle label="Paint the ceiling too" on={measure.includeCeiling} onChange={(v) => set("includeCeiling", v)} />
        <Toggle label="One wall in the feature colour" on={measure.featureWall} onChange={(v) => set("featureWall", v)} />
      </div>

      <div className="mt-6 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] p-4">
        <span className="eyebrow">The arithmetic</span>
        <dl className="mt-3 flex flex-col gap-1.5 text-[0.8125rem]">
          <Line k={`Perimeter ${areas.perimeterM} m × height ${measure.heightM} m`} v={`${areas.grossWallSqft} sq ft`} />
          <Line k={`Less ${measure.doors} door(s) and ${measure.windows} window(s)`} v={`− ${areas.deductionSqft} sq ft`} />
          <Line k="Wall area to paint" v={`${areas.netWallSqft} sq ft`} strong />
          {measure.featureWall && <Line k="of which the feature wall" v={`${areas.featureWallSqft} sq ft`} />}
          {measure.includeCeiling && <Line k="Ceiling" v={`${areas.ceilingSqft} sq ft`} />}
        </dl>
      </div>

      {quote && (
        <div className="mt-4 rounded-2xl border border-[color-mix(in_oklab,var(--color-pigment)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_7%,transparent)] p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Estimated materials</span>
            <span className="flex gap-1">
              {Object.values(colors).map((c) => (
                <span key={c} style={{ background: c }} className="h-4 w-4 rounded-sm ring-1 ring-white/10" />
              ))}
            </span>
          </div>
          <p className="data mt-2 text-[1.6rem] text-paper-50">{inr(quote.subtotal)}</p>
          <p className="mt-1 text-[0.75rem] text-paper-400">
            {quote.lines.length} items, materials only. Your dealer confirms the final price.
          </p>
          <div className="mt-3 divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)]">
            {quote.lines.map((l, i) => (
              <div key={i} className="py-2">
                <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="truncate text-paper-100">
                    {l.role} · {l.brand} {l.product}
                  </span>
                  <span className="data shrink-0 text-paper-50">{inr(l.amount)}</span>
                </div>
                <p className="data mt-0.5 text-[0.625rem] leading-relaxed text-paper-400">
                  {l.working}
                </p>
                {l.why && <p className="mt-1 text-[0.6875rem] text-paper-300">{l.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="mt-5 block">
        <span className="eyebrow">Anything else for the dealer?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Timelines, a wall you are unsure about, anything at all."
          className="mt-2 w-full resize-none rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent p-3 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
        />
      </label>

      <div className="mt-6 flex gap-3">
        <Back onClick={onBack} />
        <Next onClick={onSubmit} className="flex-1">
          Send to my dealer
        </Next>
      </div>
    </div>
  );
}

function Done({ session }: { session: { customerName: string; scheme?: SelectedScheme; quoteTotal?: number } }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-glaze)_25%,transparent)]">
        <Check className="h-6 w-6 text-[#7fd6c9]" strokeWidth={2.2} />
      </span>
      <h1 className="display mt-6 text-[2rem]">Sent to your dealer.</h1>
      <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-paper-300">
        {session.scheme?.title} is now in the queue at Sharma Interiors. They will confirm
        availability and price, and call you on the number they have.
      </p>

      {session.scheme && (
        <div className="mt-7 flex gap-1.5">
          {Object.values(session.scheme.shades).map((s) => (
            <span key={s.code} className="text-center">
              <span
                style={{ background: s.hex }}
                className="block h-14 w-11 rounded-lg ring-1 ring-white/10"
              />
              <span className="data mt-1.5 block text-[0.5rem] tracking-[0.08em] text-paper-400 uppercase">
                {s.code}
              </span>
            </span>
          ))}
        </div>
      )}

      {session.quoteTotal && (
        <p className="data mt-6 text-[0.8125rem] text-paper-400">
          Estimated materials {inr(session.quoteTotal)} — subject to your dealer’s confirmation.
        </p>
      )}

      <p className="mt-10 text-[0.75rem] text-paper-400">
        You can close this page. The link stays open until it expires.
      </p>
    </div>
  );
}

/* ================================ controls ================================ */

function Q({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[1rem] text-paper-50">{label}</p>
      {hint && <p className="mt-1 text-[0.8125rem] leading-relaxed text-paper-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-full border px-4 py-2.5 text-[0.875rem] transition-colors duration-200",
            value === o.v
              ? "border-transparent bg-paper-50 text-ink-900"
              : "border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] text-paper-300",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="data mt-2 w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-3 py-3 text-[1rem] text-paper-50 outline-none focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
      />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center justify-between rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] px-4 py-3 text-left"
    >
      <span className="text-[0.9375rem] text-paper-100">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors duration-300",
          on ? "bg-pigment" : "bg-ink-700",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            on ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(strong ? "text-paper-100" : "text-paper-400")}>{k}</dt>
      <dd className={cn("data shrink-0", strong ? "text-paper-50" : "text-paper-300")}>{v}</dd>
    </div>
  );
}

function Next({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-paper-50 text-[0.9375rem] font-medium text-ink-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" strokeWidth={1.9} />
    </button>
  );
}

function Back({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-paper-300 transition-colors hover:text-paper-50",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}
