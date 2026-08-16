# Rachna AI

**The decision layer for building-material dealers.**

Rachna AI closes the gap between what a customer wants and what a dealer can
actually sell today. A customer scans a code, uploads their space, describes what
they want in their own words, and sees it rendered in real materials — already
filtered by the dealer's live stock. The design comes back to the counter as a
specified, itemised, purchasable quotation, and the outcome feeds the dealer's
next stocking decision.

*Rachna* (रचना) means composition — the act of putting things together. That is
both what the customer is doing to their space and what the platform is doing to
a fragmented workflow.

> **Positioning rule, absolute.** Rachna AI is a building-material platform:
> coatings, tiles, wallpaper, laminates, plywood, sanitaryware and architectural
> hardware. Paint is where the first functional depth is being built because it
> has the hardest availability problem, but **no public surface — landing page,
> login, dashboard, pitch — may present Rachna AI as paint-only or paint-first.**
> The landing page contains no such framing and must not acquire one.

---

## 1. Status of this repository

**This repo currently contains the UI/UX layer only** — the landing experience,
the dealer login, the dealer console, the design system and the motion system.
Every screen runs on the demo dataset in `src/lib/demo.ts`.

There is no backend, no database, no auth and no AI integration yet. Numbers
shown anywhere in the UI are synthetic and labelled as such.

| Built | Not built yet |
| --- | --- |
| Design language + tokens | Postgres schema / Drizzle migrations |
| Landing experience: scroll-driven 3D room | Express API layer |
| Dealer login (colour-centric) | Supabase auth (the OTP flow is a stub) |
| Dealer console: overview, inventory, customers, links, performance | Real QR token issuance |
| Demo dataset with the shape the real schema needs | LLM requirement parsing, vision diagnosis |
| Brand mark, wordmark, favicon | ΔE2000 colour engine, availability engine |

### Routes

| Route | What it is |
| --- | --- |
| `/` | Landing experience — pinned 3D room, scroll-scrubbed |
| `/login` | Dealer sign-in; any number and any code open the console |
| `/dashboard` | Overview — what needs the dealer today, plus the four module tiles |
| `/dashboard/inventory` | Stock by category and brand, boost suggestions, weather/trend signals |
| `/dashboard/customers` | Submitted designs → quotation generation |
| `/dashboard/qr` | Issue a unique customer link, 48–72 h validity |
| `/dashboard/performance` | Recent deals, revenue by week, best sellers |

---

## 2. The product, in one page

### The problem

Every piece of this workflow already exists somewhere. None of it is connected.
Brand visualisers show a wall but know nothing about stock. Shade databases hold
thousands of shades but give no advice. Tally records what happened but not what
to do. **The dealer is the integration layer between all of it, running on
memory, and he is the part that does not scale.**

### The two loops

**Customer / contractor**

```
QR or link  →  upload the space  →  describe the requirement  →  visualise
            →  explore combinations  →  select material  →  give surface area
            →  receive an itemised quotation
```

**Dealer**

```
create the customer experience  →  load catalogue + inventory
                                →  receive the saved design as a lead
                                →  check real availability
                                →  quote  →  convert
```

**Dealer intelligence** (the output of the loops)

- inventory shortage detection
- reorder suggestions, with the arithmetic shown
- demand and trend signals
- colour / material demand trends
- weather-aware stocking insight
- customer and project pipeline
- open quotation opportunities

### The domain fact that shapes everything

**Dealers do not stock shades. They stock bases and colorants and tint at the
counter.**

So "is this shade in stock" is the wrong question. The right question is: *does
he hold the correct base in the requested pack size, and enough of every colorant
in that shade's formula, to produce it now?* This is why availability is a
computation, not a lookup — and why demand forecasting targets a few dozen bases
and colorants rather than thousands of shades.

The same shape recurs in other materials: the unit of availability changes
(sheet, roll, lot, grade, finish family) but the workflow does not.

---

## 3. Design language

The brief was explicit: **do not produce a generic AI-SaaS landing page**. No
hero-plus-static-cards. No purple gradient. The landing page behaves like an
interactive cinematic product experience.

### Palette — material, not UI

Every colour is derived from something a dealer physically holds.

| Token | Value | Origin |
| --- | --- | --- |
| `ink-900 … ink-500` | `#08090b` → `#262b33` | the unlit counter at night |
| `paper-50 … paper-400` | `#f7f4ee` → `#8a8477` | plaster, primer, paper |
| `pigment` | `#e2542a` | vermilion — the primary accent, used sparingly |
| `glaze` | `#1a736a` | fired ceramic glaze — confirmations, "available" |
| `brass` | `#c79a45` | architectural hardware — cautions |
| `clay`, `indigo` | `#a9543c`, `#3b4f9e` | shade-family anchors |

Dark-first, warm rather than blue-black, with a film grain overlay on plaster
surfaces so large flat areas do not band.

### Type

| Role | Face | Use |
| --- | --- | --- |
| Display | Instrument Serif | headlines only, tight leading (0.94), `-0.02em` |
| Interface | Inter | body, controls, everything readable |
| Data | JetBrains Mono | numbers, codes, eyebrows, ΔE values, SKUs |

The serif/mono pairing is deliberate: the serif carries the ambition, the mono
carries the credibility. A dealer-facing product that shows numbers in a soft
humanist sans reads as marketing; tabular mono reads as a tool.

### Visual hierarchy rules

1. One accent per viewport. If `pigment` appears twice on a screen, one of them
   is decoration and should be removed.
2. Numbers are always mono and always traceable to a stated source.
3. Section rhythm is fixed (`py-28 → py-44`); sections do not invent their own
   spacing.
4. Copy states limits inline. "Perceptible only on close inspection" beats
   "perfect match" and is the tone for the whole product.

---

## 4. The 3D storytelling sequence

One WebGL scene — **a real interior**: two walls, a floor, a window, a feature
panel, a low seat and a rug. It runs behind the hero and the pinned story and is
never torn down between beats, because the argument is that these are **six
stages of one decision**, not six features.

| Beat | Scene state | Meaning |
| --- | --- | --- |
| 01 The walk-in | bare plaster shell, wide and cold | a room, and no decision |
| 02 Understanding | an emissive sweep travels the room | the space is read before a catalogue opens |
| 03 Composition | every surface is clad — coating, wallpaper, tile, stone | a scheme, not a product |
| 04 Options | the whole scheme crossfades to a second one | changing your mind costs a second |
| 05 Availability | the room recedes, a swatch field lifts in, unstocked finishes go dark | only what the dealer can supply |
| 06 Conversion | the surviving swatches resolve into quotation lines | an itemised, purchasable answer |

Surfaces resolve in sequence rather than all at once, so the eye follows a room
being dressed instead of a single crossfade. The camera is keyframed once per
beat and interpolated with a smoothstep — it dollies, it never cuts. Pointer
position adds a small parallax so the scene feels held rather than played back.

Implementation notes:

- **Textures are generated at runtime on a 2D canvas** (`three/textures.ts`):
  tile with grout and veining, damask wallpaper, timber grain with plank seams,
  terrazzo, roller-textured emulsion. A dealer's catalogue is thousands of
  finishes; shipping photographs of any of them is neither licensable nor small.
  These are stylised, cached, and cost ~0 KB over the wire.
- Each surface is three coplanar planes (bare / scheme A / scheme B) offset by
  6 mm so the crossfade cannot z-fight.
- The swatch field is a single `InstancedMesh`; per-chip position, scale and
  colour are written every frame from one `Object3D` scratch object.
- Lighting is a warm point light at the window, two directionals and three
  `Lightformer` planes in a locally-generated environment — no HDR download.

---

## 5. Motion system

Defined once in `src/lib/motion.ts` and `globals.css`, referenced everywhere.

1. **Motion explains state change.** If nothing changed, nothing moves. There is
   no ambient floating, no looping shimmer.
2. **Everything decelerates.** `expo.out` / `power4.out`. Nothing bounces — bounce
   reads as toy, and this is used at a counter with a customer waiting.
3. **Distance scales with duration.** A hover nudge is 1px / 180ms. A section
   reveal is 18px / 620ms. A headline line-mask is 1100ms. Nothing travels far
   *and* slow, because that reads as lag.

| Token | Value | Used for |
| --- | --- | --- |
| `--dur-fast` | 180ms | hover, focus, toggles |
| `--dur-base` | 320ms | small state changes |
| `--dur-slow` | 620ms | section reveals, crossfades |
| `--dur-cinema` | 1100ms | masked headline lines |
| `STAGGER.tight/base/loose` | 35/60/90ms | groups; above 90ms reads as a queue |

Enter states live in CSS (`[data-reveal]`), released by an IntersectionObserver.
That means a no-JS or reduced-motion render shows finished content rather than an
invisible page — the usual failure of GSAP-only reveals.

---

## 6. Scroll architecture

- **Lenis** owns scroll; **GSAP's ticker** drives Lenis; **ScrollTrigger** reads
  from it. Running Lenis on its own rAF alongside GSAP produces a one-frame skew
  that reads as the 3D lagging behind the text.
- The story section is pinned with `position: sticky` inside a tall section, not
  with `ScrollTrigger.pin`. Sticky needs no spacer, survives resize and font load,
  and cannot desynchronise from the scrollbar. ScrollTrigger is used only to
  report progress.
- **Progress does not live in React state.** `src/lib/story.ts` holds a mutable
  module-level object read directly inside `useFrame`; only the discrete beat
  index (which changes six times per page) is subscribable via
  `useSyncExternalStore`.

---

## 7. Performance constraints

| Constraint | Rationale |
| --- | --- |
| One `<Canvas>` for the whole page | a second context doubles memory and the render loop for no narrative gain |
| `frameloop` flips to `never` off-screen | the GPU goes quiet for the rest of the page |
| DPR capped at 1.75 (1.25 low-power) | the scene is soft-lit matte; 3× retina buys nothing visible |
| No post-processing, no shadow maps | both cost a full pass for effects this scene does not need |
| No HDR / CDN environment fetch | renders identically offline, zero network cost |
| Low-power path under 640px or ≤4 cores | smaller chip grid, cheaper bevels, no environment |
| `prefers-reduced-motion` → still frame | the argument is visual, so removing it removes content |
| Interface mocks are drawn in CSS | crisp at any size, themed by tokens, ~0 KB |

Current production bundle: **~422 KB first load JS** for `/`, of which the bulk is
three.js — and **103–120 KB for every console route**, because the dealer app
never imports three. That split is deliberate: the cinematic cost is paid once,
by a visitor being convinced, and never by a dealer working at a counter.

---

## 8. Component architecture

```
src/
├─ app/
│  ├─ layout.tsx          fonts, metadata, theme colour
│  ├─ page.tsx            landing: section order + the stage/opaque split
│  ├─ globals.css         design tokens, type primitives, reveal choreography
│  ├─ icon.svg            favicon (the mark)
│  ├─ login/page.tsx      colour-centric dealer sign-in
│  └─ dashboard/
│     ├─ layout.tsx       console shell
│     ├─ page.tsx         overview — triage + four module tiles
│     ├─ inventory/       stock, boost suggestions, weather & trend signals
│     ├─ customers/       submitted designs → quotation
│     ├─ qr/              issue customer links
│     └─ performance/     deals, revenue, best sellers
├─ lib/
│  ├─ demo.ts             the entire demo dataset + the derived metrics
│  ├─ story.ts            shared scroll timeline (out-of-React hot path)
│  ├─ motion.ts           easing / duration / stagger tokens
│  └─ utils.ts            cn, clamp, mapRange, damp, INR formatting
├─ components/
│  ├─ brand/Logo.tsx      LogoMark, Wordmark, Logo
│  ├─ scroll/
│  │  ├─ SmoothScroll.tsx Lenis + GSAP + ScrollTrigger, one authority
│  │  └─ Reveal.tsx       Reveal, RevealLines (masked headline lines)
│  ├─ three/
│  │  ├─ StageCanvas.tsx  the single canvas + performance contract
│  │  ├─ Composition.tsx  the six-beat room
│  │  ├─ textures.ts      procedural tile / wallpaper / timber / stone / paint
│  │  └─ geometry.ts      procedural rounded slab, hash, smoothstep
│  ├─ dashboard/
│  │  ├─ Shell.tsx        rail + header + mobile bar
│  │  └─ ui.tsx           Panel, Stat, Tag, Bar, CategoryChip, PageHead
│  ├─ ui/                 Button, Pill, Rule, Section, SectionHead
│  ├─ mocks/Screens.tsx   eight drawn interface screens (landing only)
│  ├─ site/Nav.tsx
│  └─ sections/           Hero, Story, Proof, Journeys, DealerConsole,
│                         Materials, CTA + Footer
```

**Landing order and why:** Hero and Story share the fixed WebGL stage — one
continuous camera move through one room. Everything after is opaque and flat:
once the argument has been made in 3D, further motion competes with reading.
The hero carries a tagline and one sentence, nothing more; a dealer who has to
read three paragraphs to get the pitch has already decided it is not for him.

**Console order and why:** the overview answers *what needs me today* before it
offers navigation. Category identity is carried by a swatch (`CategoryChip`)
everywhere a material appears, so the dealer reads the console by colour rather
than by label.

## 8a. The demo dataset

`src/lib/demo.ts` is the single source for every figure in the console —
realistic in **shape**, obviously synthetic in **content**. Swapping it for API
calls is a one-file change.

It also holds the derived logic the real backend must own:

| Function | Rule |
| --- | --- |
| `daysOfCover(item)` | quantity ÷ weekly offtake × 7 — the number a dealer acts on |
| `stockStatus(item)` | `critical` when cover ≤ supplier lead time, then low / healthy / overstocked |
| `suggestedOrder(item)` | cover the lead time plus two weeks of demand, less what is held |

Quantity alone is never shown as a status: 6 cans is comfortable at 1/week and
an emergency at 7/week, and that distinction is the whole value of the screen.

---

## 9. The brand mark

Two material swatches, overlapped, with the intersection lit.

The overlap *is* the product: what the customer wants against what the dealer can
produce today, and the bright region is the recommendation. It is also literally a
picture of a ΔE colour comparison, which is the maths underneath the whole thing.

It survives 16px, survives one colour, and is not a gradient blob.
Files: `src/components/brand/Logo.tsx`, `src/app/icon.svg`, `public/logo.svg`.

---

## 10. Guardrails

These are refusals, held even when asked. The moment one slips, nothing else on
the screen can be trusted either. They no longer have a landing-page section —
the page had too much text — but they still govern every screen, and the console
copy is written to them (see the "Because:" line under every signal).

| We do not | Instead |
| --- | --- |
| Accounting, GST, billing, e-invoicing | the ERP keeps the books; we read stock and write back demand |
| Replace Tally | Tally is the system of record; Rachna is the layer above it |
| Say "real-time sync" over a CSV import | the UI says CSV import when it is a CSV import |
| Measure paintable area from an uncalibrated photo | guided measurement, published spreading rates, arithmetic shown |
| Claim an exact match when ΔE says otherwise | the perceptual band, in plain language, every time |
| Silently drop a required system component that is out of stock | it stays listed, flagged unavailable, with the nearest alternative |
| Predict customer taste | rank what is technically correct and actually available |
| Expose one dealer's inventory to another | never, without explicit consent |
| Build AR/VR | image-based visualisation, kept deliberately simple |

ΔE interpretation bands, used consistently in copy:

| ΔE2000 | Wording |
| --- | --- |
| < 1.0 | not perceptible |
| 1.0 – 2.0 | perceptible on close inspection |
| 2.0 – 3.5 | perceptible at a glance |
| > 3.5 | clearly different |

---

## 11. Intended stack (beyond this repo)

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| 3D & motion | React Three Fiber, three.js, GSAP + ScrollTrigger, Lenis |
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL + Drizzle ORM |
| Auth & storage | Supabase (dealer/painter accounts; customer = tokenised link, no account) |
| AI | LLM for requirement parsing and narration; Vision for substrate diagnosis; image editing for visualisation |
| Integration | Tally / ERP via CSV / Excel first, connector later |
| i18n | English and Hindi from day one, all strings externalised |

Colour maths (CIELAB conversion, CIEDE2000) is implemented directly rather than
pulled from a heavy dependency.

---

## 12. Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

Node 20+. No environment variables are required for the UI layer.

Sign-in is a stub: **any mobile number and any six-digit code open the console.**
`/dashboard` is also reachable directly without signing in.

---

## 13. Roadmap

1. **Catalogue and inventory spine** — brands, product lines, bases, colorants,
   shades, formulas; per-dealer stock; `computeAvailability()` with tests; CSV
   import with a column mapper and dry-run preview.
2. **Requirement → recommendation** — strict-JSON requirement parsing, substrate
   diagnosis with an honest `inconclusive` state, full system recommendation,
   guided quantity estimation.
3. **Colour intelligence** — ΔE2000 engine, cross-brand shade equivalence,
   inspiration-image palette extraction, simple luminance-preserving visualisation.
4. **Stranded-stock rescue** — match a requested shade against already-tinted
   cans by ΔE, age-banded discounts, a recovered-value ledger.
5. **Painter workspace** — painter-branded quotations, site stage tracking that
   becomes a forward order book, the credit khata.
6. **Dealer intelligence** — base/colorant forecasting with visible arithmetic,
   colorant stockout prevention, the Value Meter.
7. **Customer experience hardening** — low-end Android, 3G, Hindi, WhatsApp share.
8. **Second vertical** — mica/laminates, on the same workflow.

---

*Prototype. All figures in the interface are synthetic and marked as such.*
