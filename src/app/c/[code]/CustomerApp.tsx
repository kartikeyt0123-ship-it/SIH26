"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Heart,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { deltaBand } from "@/lib/color";
import type { CustomerSpec, Scheme } from "@/lib/recommend";
import { buildQuote, computeAreas } from "@/lib/quote";
import type { Measurements, SelectedScheme, SessionDTO } from "@/lib/session-types";
import {
  chooseDesign,
  deleteImage,
  fetchCatalogue,
  fetchRecommendations,
  formatRemaining,
  patchSession,
  removeDesign,
  saveDesign,
  submitSession,
  uploadImages,
  useCustomerSession,
  type DealerCatalogue,
} from "@/lib/store";
import { analyzeRoomPhotos, strongestTone, type RoomModel } from "@/lib/vision";
import { cn, inr } from "@/lib/utils";

// three.js only loads once there is a room to show — a customer on a counter
// phone should not pay for it during the questions.
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

const STEPS = ["Start", "Needs", "Photos", "Room", "Colours", "Size", "Review"];

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
  const { session, state, apply } = useCustomerSession(code);

  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState<CustomerSpec>(DEFAULT_SPEC);
  const [measure, setMeasure] = useState<Measurements>(DEFAULT_MEASURE);
  const [room, setRoom] = useState<RoomModel | null>(null);
  const [catalogue, setCatalogue] = useState<DealerCatalogue | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [schemeId, setSchemeId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<Roles, Shade>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  /* ---- catalogue: brands and paint types come from the dealer (§8, §9) ---- */
  useEffect(() => {
    fetchCatalogue().then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  /* ---- resume whatever the customer already did, within the window ---- */
  useEffect(() => {
    if (state !== "ready" || !session || hydrated.current) return;
    hydrated.current = true;
    const p = session.project;
    if (p?.spec) setSpec({ ...DEFAULT_SPEC, ...(p.spec as unknown as CustomerSpec) });
    if (p?.measurements) setMeasure({ ...DEFAULT_MEASURE, ...(p.measurements as unknown as Measurements) });
    if (p?.room) setRoom(p.room as unknown as RoomModel);
    if (session.status === "SUBMITTED") setStep(7);
    else if (p?.step) setStep(Math.min(p.step, 6));
  }, [state, session]);

  const photos = session?.project?.images ?? [];
  const saved = session?.project?.savedDesigns ?? [];
  const photoAnchor = room ? strongestTone(room) : undefined;

  /* ---- recommendations, computed on the server against live stock ---- */
  const loadSchemes = useCallback(
    async (forSpec: CustomerSpec) => {
      setBusy("recommend");
      try {
        const r = await fetchRecommendations({
          token: code,
          spec: forSpec,
          photoHex: photoAnchor,
          limit: 5,
        });
        setSchemes(r.schemes);
        if (r.schemes.length && !r.schemes.some((s) => s.id === schemeId)) {
          setSchemeId(r.schemes[0].id);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [code, photoAnchor, schemeId],
  );

  const activeScheme = schemes.find((s) => s.id === schemeId) ?? schemes[0];

  const colors = useMemo(() => {
    const base = activeScheme?.shades;
    return {
      main: (overrides.main ?? base?.main)?.hex ?? "#e7dcc7",
      feature: (overrides.feature ?? base?.feature)?.hex ?? "#4f8079",
      ceiling: (overrides.ceiling ?? base?.ceiling)?.hex ?? "#f4f1ea",
      trim: (overrides.trim ?? base?.trim)?.hex ?? "#6d6a63",
    };
  }, [activeScheme, overrides]);

  const currentSelection: SelectedScheme | null = useMemo(() => {
    if (!activeScheme) return null;
    const pick = (r: Roles) => overrides[r] ?? activeScheme.shades[r];
    const slim = (s: Shade) => ({ code: s.code, name: s.name, hex: s.hex });
    return {
      id: activeScheme.id + (Object.keys(overrides).length ? "+custom" : ""),
      title: activeScheme.title,
      rationale: activeScheme.rationale,
      lineId: activeScheme.line.id,
      trimLineId: activeScheme.trimLine?.id ?? null,
      shades: {
        main: slim(pick("main")),
        feature: slim(pick("feature")),
        ceiling: slim(pick("ceiling")),
        trim: slim(pick("trim")),
      },
    };
  }, [activeScheme, overrides]);

  const chosen = saved.find((d) => d.isChosen)?.scheme as unknown as SelectedScheme | undefined;
  const forQuote = chosen ?? currentSelection;

  const quote = useMemo(
    () => (forQuote ? buildQuote(spec, forQuote, measure) : null),
    [forQuote, spec, measure],
  );

  /* -------------------------------- guards -------------------------------- */

  if (state === "loading") return <Splash>Opening your session…</Splash>;

  if (state === "missing")
    return (
      <Splash>
        <p className="text-paper-50">We could not find session {code}.</p>
        <p className="mt-2 text-[0.875rem] text-paper-400">
          Ask your dealer to issue a new code.
        </p>
        <Link href="/c" className="mt-6 inline-block text-[0.875rem] text-pigment-soft underline underline-offset-4">
          Try another code
        </Link>
      </Splash>
    );

  if (state === "expired")
    return (
      <Splash>
        <p className="text-paper-50">This customer session has expired.</p>
        <p className="mt-2 max-w-xs text-[0.875rem] text-paper-400">
          Please request a new link from your dealer. Links are short-lived so prices and
          stock stay honest.
        </p>
      </Splash>
    );

  if (!session) return <Splash>Opening your session…</Splash>;

  /* ------------------------------- handlers ------------------------------- */

  const goto = async (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const r = await patchSession(code, { step: n });
      apply(r.session);
    } catch {
      /* a failed step save is not worth interrupting the customer for */
    }
  };

  const saveSpec = async (next: CustomerSpec) => {
    setSpec(next);
    try {
      const r = await patchSession(code, { spec: next });
      apply(r.session);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setError(null);
    try {
      const r = await uploadImages(code, Array.from(files));
      apply(r.session);
      if (r.rejected.length) setError(r.rejected.map((x) => x.reason).join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onRemovePhoto = async (id: string) => {
    const r = await deleteImage(code, id);
    apply(r.session);
  };

  const runAnalysis = async () => {
    setBusy("analyse");
    goto(3);
    const urls = photos.map((p) => p.url);
    const [model] = await Promise.all([
      analyzeRoomPhotos(urls),
      new Promise((r) => setTimeout(r, 700)),
    ]);
    setRoom(model);
    try {
      const r = await patchSession(code, {
        room: model as unknown as Record<string, unknown>,
        roomEngine: "heuristic-v1",
        roomConfidence: model.confidence,
        spec,
      });
      apply(r.session);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
    loadSchemes(spec);
  };

  const onSaveFavourite = async () => {
    if (!currentSelection) return;
    setBusy("save");
    try {
      const r = await saveDesign(code, {
        schemeId: currentSelection.id,
        label: currentSelection.title,
        scheme: currentSelection,
      });
      apply(r.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("submit");
    try {
      await patchSession(code, { spec, measurements: measure });
      const r = await submitSession(code, note.trim() || undefined);
      apply(r.session);
      setStep(7);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------------- view --------------------------------- */

  return (
    <div className="min-h-[100svh] bg-ink-900 pb-24">
      <header className="sticky top-0 z-30 border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2 text-[0.95rem]">
            <LogoMark className="h-5 w-5" />
            <Wordmark />
          </span>
          <span className="data text-[0.625rem] tracking-[0.1em] text-paper-400 uppercase">
            {session.token.slice(0, 5)} · {formatRemaining(session.hoursLeft)} left
          </span>
        </div>
        {step < 7 && (
          <div className="mx-auto flex max-w-2xl gap-1 px-5 pb-3">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-[3px] flex-1 rounded-full transition-colors duration-500",
                  i <= step ? "bg-pigment" : "bg-ink-700",
                )}
              />
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {error && (
          <p className="mb-5 rounded-xl border border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)] px-4 py-3 text-[0.8125rem] text-paper-100">
            {error}
          </p>
        )}

        {step === 0 && <Welcome session={session} onNext={() => goto(1)} />}

        {step === 1 && (
          <Questions
            spec={spec}
            catalogue={catalogue}
            setSpec={saveSpec}
            onNext={() => goto(2)}
          />
        )}

        {step === 2 && (
          <PhotoStep
            photos={photos}
            busy={busy === "upload"}
            onAdd={onUpload}
            onRemove={onRemovePhoto}
            onBack={() => goto(1)}
            onNext={runAnalysis}
          />
        )}

        {step === 3 && (
          <RoomStep
            analysing={busy === "analyse"}
            room={room}
            photos={photos}
            onBack={() => goto(2)}
            onRedo={runAnalysis}
            onNext={() => {
              if (!schemes.length) loadSchemes(spec);
              goto(4);
            }}
          />
        )}

        {step === 4 && room && (
          <ColourStep
            room={room}
            schemes={schemes}
            loading={busy === "recommend"}
            activeScheme={activeScheme}
            colors={colors}
            overrides={overrides}
            setOverrides={setOverrides}
            onPick={(id) => {
              setSchemeId(id);
              setOverrides({});
            }}
            catalogue={catalogue}
            spec={spec}
            saved={saved}
            savingFavourite={busy === "save"}
            onSaveFavourite={onSaveFavourite}
            onChoose={async (id) => apply((await chooseDesign(code, id)).session)}
            onRemoveFavourite={async (id) => apply((await removeDesign(code, id)).session)}
            onBack={() => goto(3)}
            onNext={() => goto(5)}
          />
        )}

        {step === 5 && (
          <MeasureStep
            measure={measure}
            setMeasure={async (m) => {
              setMeasure(m);
              try {
                apply((await patchSession(code, { measurements: m, spec })).session);
              } catch {
                /* saved again on submit */
              }
            }}
            onBack={() => goto(4)}
            onNext={() => goto(6)}
          />
        )}

        {step === 6 && (
          <ReviewStep
            session={session}
            spec={spec}
            measure={measure}
            scheme={forQuote}
            quote={quote}
            note={note}
            setNote={setNote}
            busy={busy === "submit"}
            onBack={() => goto(5)}
            onSubmit={submit}
          />
        )}

        {step === 7 && <Done session={session} />}
      </main>
    </div>
  );
}

type Shade = { code: string; name: string; hex: string; wallSafe: boolean; exteriorSuitable: boolean; family: string };

/* ============================== step screens ============================== */

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-8 text-center">
      <LogoMark className="mb-6 h-8 w-8" />
      <div className="text-[0.9375rem] text-paper-300">{children}</div>
    </div>
  );
}

function Welcome({ session, onNext }: { session: SessionDTO; onNext: () => void }) {
  return (
    <div>
      <span className="eyebrow">Sharma Interiors & Hardware</span>
      <h1 className="display mt-3 text-[2.4rem] leading-[1.05]">
        Let’s see it on your own walls.
      </h1>
      <p className="mt-4 text-[1rem] leading-relaxed text-paper-300">
        A few short questions, two or three photographs, and you will get colour
        combinations your dealer can actually supply — with a price you can check.
      </p>

      <ol className="mt-8 flex flex-col gap-3">
        {[
          ["Tell us what the room needs", "Paint type, budget, brand if you have a preference."],
          ["Photograph the space", "Two or three pictures from different corners."],
          ["We rebuild the room", "So you see colours on your walls, not on a card."],
          ["Shortlist and send", "Save the ones you like; your dealer prices them."],
        ].map(([t, b], i) => (
          <li
            key={t}
            className="flex gap-4 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
          >
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
  catalogue,
  setSpec,
  onNext,
}: {
  spec: CustomerSpec;
  catalogue: DealerCatalogue | null;
  setSpec: (s: CustomerSpec) => void;
  onNext: () => void;
}) {
  const set = <K extends keyof CustomerSpec>(k: K, v: CustomerSpec[K]) =>
    setSpec({ ...spec, [k]: v });

  // §8 / §9 — never hardcoded. If the dealer does not stock a brand or a
  // category, the customer is never offered it.
  const brands = catalogue?.brands ?? [];
  const categories = catalogue?.categories ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Step 1 of 6</span>
        <h1 className="display mt-3 text-[2rem]">What does the space need?</h1>
      </div>

      <Q label="Where are you painting?">
        <Choice
          options={[
            { v: "interior", l: "Inside" },
            { v: "exterior", l: "Outside" },
          ]}
          value={spec.surface}
          onChange={(v) => set("surface", v as CustomerSpec["surface"])}
        />
      </Q>

      <Q label="Which room or surface?">
        <Choice
          options={["Living room", "Bedroom", "Kitchen", "Bathroom", "Whole house", "Office", "Shop front"].map(
            (r) => ({ v: r, l: r }),
          )}
          value={spec.roomType}
          onChange={(v) => set("roomType", v)}
        />
      </Q>

      {categories.length > 0 && (
        <Q label="What kind of paint?" hint="These are the types your dealer carries.">
          <Choice
            options={[
              { v: "any", l: "Not sure — advise me" },
              ...categories.map((c) => ({ v: c.slug, l: c.label })),
            ]}
            value={spec.waterproofing ? "waterproofing" : "any"}
            onChange={(v) =>
              setSpec({
                ...spec,
                waterproofing: v === "waterproofing",
                surface: v === "exterior" ? "exterior" : v === "interior" ? "interior" : spec.surface,
                condition: v === "waterproofing" ? ["dampness"] : spec.condition,
              })
            }
          />
        </Q>
      )}

      <Q
        label="Is there damp, seepage or peeling?"
        hint="This decides the primer, and it is not optional if the answer is yes."
      >
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
          onChange={(v) => set("budget", v as CustomerSpec["budget"])}
        />
      </Q>

      <Q
        label="Any brand preference?"
        hint={
          brands.length
            ? "Only brands this dealer stocks are shown. Leave it blank for the best available."
            : "Loading the dealer’s brands…"
        }
      >
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => {
            const on = spec.brands.includes(b);
            return (
              <button
                key={b}
                onClick={() => set("brands", on ? spec.brands.filter((x) => x !== b) : [...spec.brands, b])}
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
          {spec.brands.length > 0 && (
            <button
              onClick={() => set("brands", [])}
              className="rounded-full px-3 py-2.5 text-[0.8125rem] text-paper-400 underline underline-offset-4"
            >
              No preference
            </button>
          )}
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
          onChange={(v) => set("finish", v as CustomerSpec["finish"])}
        />
      </Q>

      <Next onClick={onNext} className="mt-2">
        Next · photographs
      </Next>
    </div>
  );
}

function PhotoStep({
  photos,
  busy,
  onAdd,
  onRemove,
  onBack,
  onNext,
}: {
  photos: { id: string; url: string }[];
  busy: boolean;
  onAdd: (f: FileList | null) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <span className="eyebrow">Step 2 of 6</span>
      <h1 className="display mt-3 text-[2rem]">Photograph the space.</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-paper-300">
        Two or three pictures from different corners, with as much of the wall and floor in
        frame as you can manage. Daylight helps.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="Your space" className="h-full w-full object-cover" />
            <button
              onClick={() => onRemove(p.id)}
              aria-label="Remove"
              className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900/80 text-paper-100"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        ))}

        {photos.length < 3 && (
          <label
            className={cn(
              "flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_22%,transparent)] text-paper-400 transition-colors hover:border-[color-mix(in_oklab,var(--color-pigment)_50%,transparent)] hover:text-paper-200",
              busy && "pointer-events-none opacity-50",
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.6} />
            ) : (
              <Camera className="h-5 w-5" strokeWidth={1.5} />
            )}
            <span className="text-[0.6875rem]">{busy ? "Uploading" : "Add photo"}</span>
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
        Your photographs are uploaded to your dealer&rsquo;s Rachna account and used to rebuild
        the room&rsquo;s proportions and read the tones already in it — not to measure it. You
        will enter the size yourself in a moment.
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
  photos: { id: string; url: string }[];
  onBack: () => void;
  onRedo: () => void;
  onNext: () => void;
}) {
  if (analysing || !room)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-pigment" strokeWidth={1.6} />
        <div>
          <p className="text-[1rem] text-paper-50">Analysing your space…</p>
          <p className="mt-2 text-[0.8125rem] text-paper-400">
            Finding the floor line, the light and the tones already in the room.
          </p>
        </div>
      </div>
    );

  return (
    <div>
      <span className="eyebrow">Step 3 of 6</span>
      <h1 className="display mt-3 text-[2rem]">Here is your room.</h1>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url} alt="" className="aspect-[3/4] w-full rounded-lg object-cover opacity-70" />
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

function ColourStep(props: {
  room: RoomModel;
  schemes: Scheme[];
  loading: boolean;
  activeScheme?: Scheme;
  colors: { main: string; feature: string; ceiling: string; trim: string };
  overrides: Partial<Record<Roles, Shade>>;
  setOverrides: (o: Partial<Record<Roles, Shade>>) => void;
  onPick: (id: string) => void;
  catalogue: DealerCatalogue | null;
  spec: CustomerSpec;
  saved: { id: string; label: string | null; scheme: Record<string, unknown>; isChosen: boolean }[];
  savingFavourite: boolean;
  onSaveFavourite: () => void;
  onChoose: (id: string) => void;
  onRemoveFavourite: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const {
    room, schemes, loading, activeScheme, colors, overrides, setOverrides, onPick,
    catalogue, spec, saved, savingFavourite, onSaveFavourite, onChoose, onRemoveFavourite,
    onBack, onNext,
  } = props;

  const [editing, setEditing] = useState<Roles | null>(null);

  // Only shades the dealer can produce today reach this grid (§15).
  const pool = useMemo(
    () =>
      (catalogue?.shades ?? []).filter((s) =>
        spec.surface === "exterior" ? s.exteriorSuitable : true,
      ),
    [catalogue, spec.surface],
  );

  if (loading)
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-pigment" strokeWidth={1.6} />
        <p className="text-[0.9375rem] text-paper-200">
          Matching combinations against your dealer&rsquo;s stock…
        </p>
      </div>
    );

  if (!activeScheme)
    return (
      <div className="py-16 text-center">
        <p className="text-paper-50">
          No combination fits those answers and this dealer&rsquo;s current stock.
        </p>
        <p className="mt-2 text-[0.875rem] text-paper-400">
          Try removing the brand preference, or widening the budget.
        </p>
        <Back onClick={onBack} className="mx-auto mt-6" />
      </div>
    );

  return (
    <div>
      <span className="eyebrow">Step 4 of 6</span>
      <h1 className="display mt-3 text-[2rem]">Try them on your walls.</h1>
      <p className="mt-2 text-[0.875rem] text-paper-400">
        Drag to look around. Everything below is producible at this dealer today.
      </p>

      <div className="relative mt-5 aspect-[4/5] overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] sm:aspect-[4/3]">
        <RoomViewer room={room} colors={colors} className="h-full w-full" />
        <span className="data pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink-900/70 px-3 py-1.5 text-[0.5625rem] tracking-[0.12em] text-paper-300 uppercase">
          Reconstruction · drag to look around
        </span>
      </div>

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
              <span style={{ background: shade.hex }} className="block h-8 w-full rounded-md ring-1 ring-white/10" />
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
                  onClick={() => setOverrides({ ...overrides, [editing]: s as Shade })}
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
            Shades your dealer cannot produce today are not shown at all.
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

      <button
        onClick={onSaveFavourite}
        disabled={savingFavourite}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-pigment)_50%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_10%,transparent)] text-[0.9375rem] text-paper-50 disabled:opacity-50"
      >
        <Heart className="h-4 w-4" strokeWidth={1.8} />
        {savingFavourite ? "Saving…" : "Save this combination"}
      </button>

      {saved.length > 0 && (
        <div className="mt-5">
          <span className="eyebrow">Your shortlist · {saved.length}</span>
          <div className="mt-3 flex flex-col gap-2">
            {saved.map((d) => {
              const sc = d.scheme as unknown as SelectedScheme;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    d.isChosen
                      ? "border-[color-mix(in_oklab,var(--color-glaze)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_10%,transparent)]"
                      : "border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)]",
                  )}
                >
                  <span className="flex shrink-0 gap-1">
                    {Object.values(sc.shades).map((s) => (
                      <span key={s.code} style={{ background: s.hex }} className="h-8 w-3 rounded-sm" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] text-paper-100">
                    {d.label ?? sc.title}
                  </span>
                  {d.isChosen ? (
                    <span className="data shrink-0 text-[0.5625rem] tracking-[0.12em] text-[#7fd6c9] uppercase">
                      chosen
                    </span>
                  ) : (
                    <button
                      onClick={() => onChoose(d.id)}
                      className="shrink-0 text-[0.75rem] text-paper-300 underline underline-offset-4"
                    >
                      Choose
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveFavourite(d.id)}
                    aria-label="Remove"
                    className="shrink-0 text-paper-400"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-7">
        <span className="eyebrow flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-pigment" strokeWidth={1.8} />
          Recommended for you
        </span>
        <div className="mt-3 flex flex-col gap-3">
          {schemes.map((s) => {
            const on = s.id === activeScheme.id;
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
                      {s.line.brand} {s.line.name}
                    </span>
                  </span>
                </div>
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-paper-300">{s.rationale}</p>
                <p className="data mt-2 text-[0.625rem] tracking-[0.06em] text-[#5fbfb3]">
                  ✓ Available at this dealer
                  {s.photoDelta !== undefined &&
                    ` · ΔE ${s.photoDelta.toFixed(1)} from your room — ${deltaBand(s.photoDelta)}`}
                </p>
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
  onBack,
  onNext,
}: {
  measure: Measurements;
  setMeasure: (m: Measurements) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const areas = computeAreas(measure);
  const set = <K extends keyof Measurements>(k: K, v: Measurements[K]) =>
    setMeasure({ ...measure, [k]: v });

  return (
    <div>
      <span className="eyebrow">Step 5 of 6</span>
      <h1 className="display mt-3 text-[2rem]">How big is the space?</h1>
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

      <div className="mt-6 flex gap-3">
        <Back onClick={onBack} />
        <Next onClick={onNext} className="flex-1">
          Review my project
        </Next>
      </div>
    </div>
  );
}

function ReviewStep({
  session,
  spec,
  measure,
  scheme,
  quote,
  note,
  setNote,
  busy,
  onBack,
  onSubmit,
}: {
  session: SessionDTO;
  spec: CustomerSpec;
  measure: Measurements;
  scheme: SelectedScheme | null;
  quote: ReturnType<typeof buildQuote> | null;
  note: string;
  setNote: (s: string) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const photos = session.project?.images ?? [];

  return (
    <div>
      <span className="eyebrow">Step 6 of 6</span>
      <h1 className="display mt-3 text-[2rem]">Your project.</h1>

      {photos.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      {scheme && (
        <div className="mt-5 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
          <span className="eyebrow">Selected design</span>
          <p className="mt-2 text-[1.05rem] text-paper-50">{scheme.title}</p>
          <div className="mt-3 flex gap-2">
            {Object.entries(scheme.shades).map(([role, s]) => (
              <span key={role} className="flex-1 text-center">
                <span style={{ background: s.hex }} className="block h-12 w-full rounded-lg ring-1 ring-white/10" />
                <span className="data mt-1 block text-[0.5rem] tracking-[0.06em] text-paper-400 uppercase">
                  {role}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3">
        {[
          ["Surface", spec.surface === "exterior" ? "Outside" : "Inside"],
          ["Space", spec.roomType],
          ["Budget", spec.budget],
          ["Brand", spec.brands.length ? spec.brands.join(", ") : "No preference"],
          ["Room", `${measure.lengthM} × ${measure.widthM} × ${measure.heightM} m`],
          ["Coats", String(measure.coats)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-3">
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-1 text-[0.875rem] text-paper-100 capitalize">{v}</dd>
          </div>
        ))}
      </dl>

      {quote && (
        <div className="mt-4 rounded-2xl border border-[color-mix(in_oklab,var(--color-pigment)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_7%,transparent)] p-4">
          <span className="eyebrow">Estimated materials</span>
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
                <p className="data mt-0.5 text-[0.625rem] leading-relaxed text-paper-400">{l.working}</p>
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
        <Next onClick={onSubmit} disabled={busy || !scheme} className="flex-1">
          {busy ? "Sending…" : "Submit to dealer"}
        </Next>
      </div>
    </div>
  );
}

function Done({ session }: { session: SessionDTO }) {
  const chosen = session.project?.savedDesigns.find((d) => d.isChosen)?.scheme as
    | unknown as SelectedScheme
    | undefined;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-glaze)_25%,transparent)]">
        <Check className="h-6 w-6 text-[#7fd6c9]" strokeWidth={2.2} />
      </span>
      <h1 className="display mt-6 text-[2rem]">Design submitted successfully.</h1>
      <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-paper-300">
        Your selected design has been sent to the dealer. They will confirm availability and
        price, and call you on the number they have.
      </p>

      {chosen && (
        <div className="mt-7 flex gap-1.5">
          {Object.values(chosen.shades).map((s) => (
            <span key={s.code} className="text-center">
              <span style={{ background: s.hex }} className="block h-14 w-11 rounded-lg ring-1 ring-white/10" />
              <span className="data mt-1.5 block text-[0.5rem] tracking-[0.08em] text-paper-400 uppercase">
                {s.code}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-10 text-[0.75rem] text-paper-400">You can close this page now.</p>
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
      <span className={cn("relative h-6 w-11 rounded-full transition-colors duration-300", on ? "bg-pigment" : "bg-ink-700")}>
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
