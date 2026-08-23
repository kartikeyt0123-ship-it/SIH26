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
  fetchMaterials,
  fetchRecommendations,
  fetchWhatIf,
  formatRemaining,
  patchSession,
  postDesignSignals,
  postSurfaceReport,
  removeDesign,
  saveDesign,
  submitSession,
  uploadImages,
  useCustomerSession,
  type DealerCatalogue,
  type MaterialsResponse,
} from "@/lib/store";
import { analyzeRoomPhotos, compressForUpload, strongestTone, type RoomModel } from "@/lib/vision";
import { analyseSurfaces } from "@/lib/surface-client";
import type { SurfaceReport } from "@/lib/surface";
import { briefSignal, schemeSignal, type DesignDNA, type DesignSignal } from "@/lib/dna";
import type { Intent } from "@/lib/whatif";
import {
  DesignDNACard,
  MaterialsCard,
  PrepPicker,
  SurfaceHealthCard,
  UnavailableShade,
  WhatIfPanel,
  type PrepChoice,
  type SubstituteInfo,
} from "@/components/customer/Intelligence";
import { prepOptions } from "@/lib/recommend";
import { PRODUCT_LINES } from "@/lib/catalog";
import { fetchSubstitutes, requestShade } from "@/lib/store";
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
  climateZone: "moderate",
  // Left undefined until the customer actually answers the surface report.
  // An empty array would mean "they declined every prep step", which is a
  // different statement from "we never asked".
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
  // The dealer may have issued the code before asking a name. The customer
  // confirms who they are on the review screen, so the queue never shows a
  // design from "Walk-in customer" with no way to call them back.
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  /* ------------------------- Round 2: intelligence ------------------------- */
  // All optional. Every one of these staying null is a complete, working
  // journey — the Round 1 flow does not read any of them.
  const [surface, setSurface] = useState<SurfaceReport | null>(null);
  const [surfaceProgress, setSurfaceProgress] = useState<{ done: number; total: number } | null>(null);
  const [dna, setDna] = useState<DesignDNA | null>(null);
  const [whatIf, setWhatIf] = useState<{
    intent: Intent;
    prompt: string;
    schemes: Scheme[];
    changed: string[];
  } | null>(null);
  const [whatIfBusy, setWhatIfBusy] = useState<Intent | null>(null);
  const [materials, setMaterials] = useState<MaterialsResponse | null>(null);
  /** Prep product ids the customer has ticked. Null until the report exists. */
  const [prepPicked, setPrepPicked] = useState<string[] | null>(null);
  const [unavailable, setUnavailable] = useState<SubstituteInfo | null>(null);
  const [requestedShades, setRequestedShades] = useState<string[]>([]);
  const [requestingShade, setRequestingShade] = useState(false);

  /* ---- catalogue: brands and paint types come from the dealer (§8, §9) ---- */
  useEffect(() => {
    fetchCatalogue(code).then(setCatalogue).catch(() => setCatalogue(null));
  }, [code]);

  /* ---- resume whatever the customer already did, within the window ---- */
  useEffect(() => {
    if (state !== "ready" || !session || hydrated.current) return;
    hydrated.current = true;
    const p = session.project;
    if (p?.spec) setSpec({ ...DEFAULT_SPEC, ...(p.spec as unknown as CustomerSpec) });
    if (p?.measurements) setMeasure({ ...DEFAULT_MEASURE, ...(p.measurements as unknown as Measurements) });
    if (p?.room) setRoom(p.room as unknown as RoomModel);
    if (session.customerName && session.customerName !== "Walk-in customer") {
      setContactName(session.customerName);
    }
    if (session.phone) setContactPhone(session.phone);
    if (session.status === "SUBMITTED") setStep(7);
    else if (p?.step) setStep(Math.min(p.step, 6));

    // A customer returning within the window gets their analysis and profile
    // back rather than being asked to run them again.
    if (p?.surface) setSurface(p.surface as unknown as SurfaceReport);
    if (p?.dna) setDna(p.dna as unknown as DesignDNA);
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

  // What-If results join the pool of selectable schemes, which is what lets a
  // variation be previewed, shortlisted, quoted and submitted through the
  // existing path rather than living in a parallel world of its own.
  const allSchemes = useMemo(() => {
    const seen = new Set(schemes.map((s) => s.id));
    return [...schemes, ...(whatIf?.schemes ?? []).filter((s) => !seen.has(s.id))];
  }, [schemes, whatIf]);

  const activeScheme = allSchemes.find((s) => s.id === schemeId) ?? allSchemes[0];

  /**
   * The preparation on offer, priced.
   *
   * Derived from the current brief rather than stored, so a diagnosis that
   * changes — the customer re-shoots a wall and the damp reading clears —
   * changes what is offered instead of leaving a stale recommendation ticked.
   */
  const prepChoices: PrepChoice[] = useMemo(
    () =>
      surface
        ? prepOptions(spec).map((o) => ({
            id: o.line.id,
            name: o.line.name,
            brand: o.line.brand,
            category: o.line.category,
            required: o.required,
            why: o.why,
            pricePerLitre: PRODUCT_LINES.find((p) => p.id === o.line.id)?.pricePerLitre ?? 0,
          }))
        : [],
    [surface, spec],
  );

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

  /**
   * Companion materials and climate, fetched only once the customer reaches the
   * review screen and only for the scheme they actually landed on.
   *
   * Loading this earlier would mean re-fetching on every colour tap for a panel
   * nobody has scrolled to yet.
   */
  const mainHex = forQuote?.shades.main.hex;
  const accentHex = forQuote?.shades.feature.hex;
  useEffect(() => {
    if (step !== 6 || !mainHex || !accentHex) return;
    let cancelled = false;
    fetchMaterials({
      token: code,
      mainHex,
      accentHex,
      surface: spec.surface,
      conditions: spec.condition,
      roomType: spec.roomType,
      budget: spec.budget,
    })
      .then((r) => !cancelled && setMaterials(r))
      // Silent: the review screen must submit whether or not this panel loads.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [step, code, mainHex, accentHex, spec.surface, spec.condition, spec.roomType, spec.budget]);

  const quote = useMemo(
    () => (forQuote ? buildQuote(spec, forQuote, measure) : null),
    [forQuote, spec, measure],
  );

  /**
   * Record preference signals.
   *
   * Deliberately fire-and-forget. A dropped signal costs a slightly thinner
   * profile; an error toast in the middle of someone choosing a colour costs
   * the sale. The profile is derived on the server from the whole stored
   * history — never patched locally — and the response is what updates the card.
   *
   * DECLARED ABOVE THE GUARDS, and it must stay there. Everything below the
   * guards runs only once the session has loaded, so a hook placed there is
   * skipped on the first render and called on the second — which is exactly
   * "Rendered more hooks than during the previous render", and it takes the
   * whole customer app down the moment the session arrives. Every hook in this
   * component belongs above this line.
   */
  const recordSignals = useCallback(
    async (signals: DesignSignal[]) => {
      if (!signals.length) return;
      try {
        const r = await postDesignSignals(code, signals);
        setDna(r.dna);
      } catch {
        /* a lost signal is not worth interrupting the customer for */
      }
    },
    [code],
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
      // The opening brief anchors the Design DNA before the customer has seen
      // a single scheme, and is quickly outweighed by what they actually do.
      recordSignals([briefSignal(next)]);
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
      // Resize on the phone first — see compressForUpload. Sending raw camera
      // files over a mobile connection is what made this feel broken.
      const prepared = await Promise.all(Array.from(files).map((f) => compressForUpload(f)));
      const r = await uploadImages(code, prepared);
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

  /* ------------------------- Round 2: the handlers ------------------------- */

  /**
   * Surface analysis. Optional, and explicitly asked for.
   *
   * The measurement runs in this browser over photographs that are already
   * here, so the only thing that crosses the network is the reading. It never
   * blocks the wizard: a failure leaves `surface` null and the customer carries
   * on, because a wall reading is a bonus and choosing a colour is the job.
   */
  const runSurfaceAnalysis = async () => {
    if (!photos.length) return;
    setBusy("surface");
    setSurfaceProgress({ done: 0, total: photos.length });
    try {
      const report = await analyseSurfaces(
        photos.map((p) => p.url),
        spec.surface,
        (done, total) => setSurfaceProgress({ done, total }),
      );
      if (!report) {
        setError("Those photographs could not be read. You can carry on without this step.");
        return;
      }
      setSurface(report);
      // Feed the diagnosis back into the brief, so the recommender actually
      // reacts to it — this is what makes the analysis change the answer rather
      // than only the screen.
      const merged: CustomerSpec = {
        ...spec,
        condition: [...new Set([...spec.condition, ...report.conditions])],
        waterproofing: spec.waterproofing || report.conditions.includes("dampness"),
      };
      setSpec(merged);
      // Everything the diagnosis called for starts ticked. The customer can
      // untick, but the default has to be the correct job rather than the
      // cheapest one.
      const opts = prepOptions(merged);
      setPrepPicked(opts.filter((o) => o.required || o.line.category === "primer").map((o) => o.line.id));
      const r = await postSurfaceReport(code, report, spec.surface);
      apply(r.session);
      await patchSession(code, { spec: merged }).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setSurfaceProgress(null);
    }
  };

  /**
   * The customer ticks or unticks preparation.
   *
   * Written into the spec, because that is what `buildQuote` reads — so the
   * choice reaches the dealer's quotation rather than living only on this
   * screen. Persisted immediately: a customer who ticks putty and then closes
   * the tab should still have chosen putty when they come back.
   */
  const setPrep = async (ids: string[]) => {
    setPrepPicked(ids);
    const next: CustomerSpec = { ...spec, prepAccepted: ids };
    setSpec(next);
    try {
      apply((await patchSession(code, { spec: next })).session);
    } catch {
      /* re-saved on submit */
    }
  };

  /**
   * The customer tapped a shade the dealer cannot mix today.
   *
   * Only shades outside the producible set ever reach here — the swatch grid is
   * already filtered — so this is the deliberate "I want that one anyway" path.
   */
  const inspectShade = async (code0: string) => {
    try {
      const info = await fetchSubstitutes(code, code0, spec.surface);
      setUnavailable(info.available ? null : info);
    } catch {
      setUnavailable(null);
    }
  };

  const askForShade = async () => {
    if (!unavailable) return;
    setRequestingShade(true);
    try {
      await requestShade(code, unavailable.wanted.code, unavailable.substitutes[0]?.shade.code);
      setRequestedShades((prev) => [...prev, unavailable.wanted.code]);
      recordSignals([
        {
          kind: "brief",
          at: new Date().toISOString(),
          hexes: [unavailable.wanted.hex],
          note: `requested unavailable shade ${unavailable.wanted.name}`,
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRequestingShade(false);
    }
  };

  const askWhatIf = async (intent: Intent) => {
    setWhatIfBusy(intent);
    try {
      const r = await fetchWhatIf({ token: code, intent, spec, photoHex: photoAnchor });
      setWhatIf({ intent: r.intent, prompt: r.prompt, schemes: r.schemes, changed: r.changed });
      // Asking for a direction is itself a preference signal, and a strong one.
      recordSignals([
        { kind: "brief", at: new Date().toISOString(), note: `asked for ${intent}` },
        ...r.schemes.slice(0, 1).map((s) => schemeSignal("viewed", s)),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWhatIfBusy(null);
    }
  };

  /**
   * Shortlist a specific scheme.
   *
   * Takes the scheme rather than reading the current selection, because the
   * What-If panel saves in the same gesture that selects — and `setSchemeId`
   * has not committed by the time the handler runs, so reading state here would
   * reliably save the previously selected scheme instead.
   */
  const saveScheme = async (s: Scheme) => {
    setBusy("save");
    try {
      const slim = (sh: Shade) => ({ code: sh.code, name: sh.name, hex: sh.hex });
      const design: SelectedScheme = {
        id: s.id,
        title: s.title,
        rationale: s.rationale,
        lineId: s.line.id,
        trimLineId: s.trimLine?.id ?? null,
        shades: {
          main: slim(s.shades.main),
          feature: slim(s.shades.feature),
          ceiling: slim(s.shades.ceiling),
          trim: slim(s.shades.trim),
        },
      };
      const r = await saveDesign(code, { schemeId: s.id, label: s.title, scheme: design });
      apply(r.session);
      recordSignals([schemeSignal("saved", s)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
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
      // The strongest signal the customer gives short of submitting.
      recordSignals([
        {
          kind: "saved",
          at: new Date().toISOString(),
          hexes: [currentSelection.shades.main.hex, currentSelection.shades.feature.hex],
          finish: activeScheme?.line.finish,
          budget: activeScheme?.line.budget,
          approach: activeScheme?.approach,
          roomType: spec.roomType,
          surface: spec.surface,
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("submit");
    try {
      // If the customer never tapped "save", the combination they are looking
      // at is still their answer — persist it before submitting. Without this
      // the dealer receives a submission with no design attached, which is the
      // one outcome this whole flow exists to prevent.
      if (!chosen && currentSelection) {
        await saveDesign(code, {
          schemeId: currentSelection.id,
          label: currentSelection.title,
          scheme: currentSelection,
        });
      }
      await patchSession(code, {
        spec,
        measurements: measure,
        customerName: contactName.trim() || undefined,
        phone: contactPhone.trim() || undefined,
      });
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
            surface={surface}
            surfaceBusy={busy === "surface"}
            surfaceProgress={surfaceProgress}
            onAnalyseSurface={runSurfaceAnalysis}
            prepOptions={prepChoices}
            prepPicked={prepPicked ?? []}
            onPrepChange={setPrep}
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
            schemes={allSchemes}
            loading={busy === "recommend"}
            activeScheme={activeScheme}
            colors={colors}
            overrides={overrides}
            setOverrides={setOverrides}
            dna={dna}
            whatIf={whatIf}
            whatIfBusy={whatIfBusy}
            onAskWhatIf={askWhatIf}
            onSignal={recordSignals}
            onSaveScheme={saveScheme}
            unavailable={unavailable}
            requestedShades={requestedShades}
            requestingShade={requestingShade}
            onInspectShade={inspectShade}
            onRequestShade={askForShade}
            onDismissUnavailable={() => setUnavailable(null)}
            onPick={(id) => {
              setSchemeId(id);
              setOverrides({});
              // Opening a scheme is a real, if weak, preference signal.
              const picked = allSchemes.find((s) => s.id === id);
              if (picked) recordSignals([schemeSignal("previewed", picked)]);
            }}
            catalogue={catalogue}
            spec={spec}
            saved={saved}
            savingFavourite={busy === "save"}
            onSaveFavourite={onSaveFavourite}
            onChoose={async (id) => apply((await chooseDesign(code, id)).session)}
            onRemoveFavourite={async (id) => {
              // Removing a shortlist entry is the clearest rejection the
              // customer ever gives, and the profile weights it negatively.
              const removed = saved.find((d) => d.id === id)?.scheme as
                | { shades?: Record<string, { hex: string }> }
                | undefined;
              const hexes = removed?.shades
                ? [removed.shades.main?.hex, removed.shades.feature?.hex].filter(
                    (h): h is string => Boolean(h),
                  )
                : undefined;
              apply((await removeDesign(code, id)).session);
              recordSignals([{ kind: "discarded", at: new Date().toISOString(), hexes }]);
            }}
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
            contactName={contactName}
            setContactName={setContactName}
            contactPhone={contactPhone}
            setContactPhone={setContactPhone}
            busy={busy === "submit"}
            onBack={() => goto(5)}
            onSubmit={submit}
            surface={surface}
            materials={materials}
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

      {/* Asked of the customer rather than taken from the dealer's city: the
          two are often different, and this is something a customer can answer
          accurately in one tap. It changes the ranking, not just the wording. */}
      <Q
        label="What is the weather like where the building is?"
        hint="It changes which finishes last. Skip it if you are not sure."
      >
        <Choice
          options={[
            { v: "hot", l: "Very hot & sunny" },
            { v: "rainy", l: "Heavy rain" },
            { v: "coastal", l: "Coastal / salty air" },
            { v: "cold", l: "Cold winters" },
            { v: "moderate", l: "Nothing extreme" },
          ]}
          value={spec.climateZone ?? "moderate"}
          onChange={(v) => set("climateZone", v as CustomerSpec["climateZone"])}
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
  surface,
  surfaceBusy,
  surfaceProgress,
  onAnalyseSurface,
  prepOptions,
  prepPicked,
  onPrepChange,
}: {
  photos: { id: string; url: string }[];
  busy: boolean;
  onAdd: (f: FileList | null) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  surface: SurfaceReport | null;
  surfaceBusy: boolean;
  surfaceProgress: { done: number; total: number } | null;
  onAnalyseSurface: () => void;
  prepOptions: PrepChoice[];
  prepPicked: string[];
  onPrepChange: (ids: string[]) => void;
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

      {/* Optional, and offered rather than imposed — the customer can walk
          straight past it to the room build without ever tapping this. */}
      {photos.length > 0 && !surface && (
        <button
          type="button"
          onClick={onAnalyseSurface}
          disabled={surfaceBusy}
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_7%,transparent)] p-4 text-left transition-colors hover:border-[color-mix(in_oklab,var(--color-brass)_60%,transparent)] disabled:opacity-60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--color-brass)_16%,transparent)] text-[#e0bd72]">
            {surfaceBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Sparkles className="h-4 w-4" strokeWidth={1.7} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] text-paper-50">
              {surfaceBusy
                ? `Analysing image ${surfaceProgress?.done ?? 0} of ${surfaceProgress?.total ?? photos.length}…`
                : "Analyse surface"}
            </span>
            <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-paper-400">
              Check these photographs for cracks, damp, peeling or staining before you choose a
              colour. Optional — it takes a moment and runs on your phone.
            </span>
          </span>
        </button>
      )}

      {surface && (
        <div className="mt-5">
          <SurfaceHealthCard
            report={surface}
            disclosure="Read in your browser from the photograph's own pixel statistics. Not a trained model, and not an inspection."
            busy={surfaceBusy}
            progress={surfaceProgress}
          />
          {prepOptions.length > 0 && (
            <PrepPicker options={prepOptions} selected={prepPicked} onChange={onPrepChange} />
          )}
        </div>
      )}

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
  dna: DesignDNA | null;
  whatIf: { intent: Intent; prompt: string; schemes: Scheme[]; changed: string[] } | null;
  whatIfBusy: Intent | null;
  onAskWhatIf: (i: Intent) => void;
  onSignal: (s: DesignSignal[]) => void;
  onSaveScheme: (s: Scheme) => void;
  unavailable: SubstituteInfo | null;
  requestedShades: string[];
  requestingShade: boolean;
  onInspectShade: (code: string) => void;
  onRequestShade: () => void;
  onDismissUnavailable: () => void;
}) {
  const {
    room, schemes, loading, activeScheme, colors, overrides, setOverrides, onPick,
    catalogue, spec, saved, savingFavourite, onSaveFavourite, onChoose, onRemoveFavourite,
    onBack, onNext, dna, whatIf, whatIfBusy, onAskWhatIf, onSaveScheme,
    unavailable, requestedShades, requestingShade, onInspectShade, onRequestShade,
    onDismissUnavailable,
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
        {/* The room type decides the furniture — a bedroom gets a bed, not a
            sofa. Colour is judged against the objects that will actually be in
            front of the wall. */}
        <RoomViewer
          room={room}
          colors={colors}
          roomType={spec.roomType}
          className="h-full w-full"
        />
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
                  onClick={() =>
                    // An unavailable swatch cannot go on the wall. Tapping it
                    // opens the alternatives instead of silently doing nothing,
                    // which is the difference between a dead swatch and a
                    // conversation about what the dealer can actually mix.
                    s.available
                      ? setOverrides({ ...overrides, [editing]: s as Shade })
                      : onInspectShade(s.code)
                  }
                  title={
                    s.available
                      ? `${s.name} · ${s.code}`
                      : `${s.name} · not available today — tap for alternatives`
                  }
                  style={{ background: s.hex }}
                  className={cn(
                    "relative aspect-square rounded-lg ring-1 transition-transform duration-200",
                    on ? "scale-110 ring-2 ring-paper-50" : "ring-white/10 hover:scale-105",
                    !s.available && "opacity-40",
                  )}
                >
                  {!s.available && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center text-[0.9rem] leading-none text-white/80"
                    >
                      ·
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-paper-400">
            Faded swatches are colours your dealer cannot mix today. Tap one to see the closest
            they can — or to ask them to stock it.
          </p>

          {unavailable && (
            <div className="mt-4">
              <UnavailableShade
                info={unavailable}
                requested={requestedShades.includes(unavailable.wanted.code)}
                requesting={requestingShade}
                onRequest={onRequestShade}
                onUse={(code) => {
                  const pick = pool.find((p) => p.code === code);
                  if (pick) setOverrides({ ...overrides, [editing]: pick as Shade });
                  onDismissUnavailable();
                }}
              />
            </div>
          )}
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
                    {/* Keyed by role: a ceiling that matches the walls is a
                        normal scheme, and keying by shade code would make two
                        siblings share a key. */}
                    {Object.entries(sc.shades).map(([role, s]) => (
                      <span key={role} style={{ background: s.hex }} className="h-8 w-3 rounded-sm" />
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

      {/* The two intelligence panels sit below the recommendations, collapsed,
          so the Round 1 journey is unchanged for anyone who ignores them. */}
      <div className="mt-7 flex flex-col gap-3">
        <WhatIfPanel
          onAsk={onAskWhatIf}
          busyIntent={whatIfBusy}
          result={whatIf}
          activeSchemeId={activeScheme.id}
          savedIds={new Set(saved.map((d) => (d.scheme as { id?: string }).id ?? ""))}
          onPreview={(s) => onPick(s.id)}
          onSave={(s) => {
            onPick(s.id);
            onSaveScheme(s as unknown as Scheme);
          }}
        />
        {dna && (
          <DesignDNACard
            dna={dna}
            disclosure="Built from what you actually opened, saved and skipped, using fixed rules. No machine learning is involved."
          />
        )}
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
  contactName,
  setContactName,
  contactPhone,
  setContactPhone,
  busy,
  onBack,
  onSubmit,
  surface,
  materials,
}: {
  session: SessionDTO;
  spec: CustomerSpec;
  measure: Measurements;
  scheme: SelectedScheme | null;
  quote: ReturnType<typeof buildQuote> | null;
  note: string;
  setNote: (s: string) => void;
  contactName: string;
  setContactName: (s: string) => void;
  contactPhone: string;
  setContactPhone: (s: string) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
  surface: SurfaceReport | null;
  materials: MaterialsResponse | null;
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

      {/* The intelligence layer travels with the submission: the dealer sees
          the same surface reading and the same companion list the customer did,
          so the conversation at the counter starts from one shared picture. */}
      {(surface || materials) && (
        <div className="mt-4 flex flex-col gap-3">
          {surface && (
            <SurfaceHealthCard
              report={surface}
              disclosure="Read in your browser from the photograph's own pixel statistics. Not a trained model, and not an inspection."
            />
          )}
          {materials && <MaterialsCard data={materials} />}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
        <span className="eyebrow">Who should the dealer call?</span>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-3 py-3 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
          />
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            inputMode="tel"
            placeholder="Mobile number"
            className="data w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-3 py-3 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
          />
        </div>
      </div>

      <label className="mt-4 block">
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
