import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { Nav } from "@/components/site/Nav";
import { StageCanvas } from "@/components/three/StageCanvas";
import { Hero } from "@/components/sections/Hero";
import { Story } from "@/components/sections/Story";
import { Proof } from "@/components/sections/Proof";
import { Journeys } from "@/components/sections/Journeys";
import { DealerConsole } from "@/components/sections/DealerConsole";
import { Materials } from "@/components/sections/Materials";
import { CTA, Footer } from "@/components/sections/CTA";

/**
 * Page architecture.
 *
 * The hero and the pinned story share one fixed WebGL stage — a single
 * continuous camera move through one room, not two separate visuals.
 * Everything after the stage is opaque and flat: once the argument has been
 * made in 3D, further motion competes with reading.
 *
 *   #stage   Hero      the tagline, and nothing else
 *            Story     six scroll-scrubbed beats in one room
 *   ----     Proof     three claims, no paragraphs
 *            Journeys  dealer track / customer track
 *            Dealer    the intelligence the loop produces
 *            Materials one workflow across every category in the shop
 *            CTA
 */
export default function Home() {
  return (
    <SmoothScroll>
      <Nav />
      <main>
        <div className="relative">
          <StageCanvas className="pointer-events-none fixed inset-0 z-0 h-[100svh] w-full" />
          <div className="relative z-10">
            <Hero />
            <Story />
          </div>
        </div>

        {/* Opaque from here down so the fixed canvas is fully occluded. */}
        <div className="relative z-20 bg-ink-900">
          <Proof />
          <Journeys />
          <DealerConsole />
          <Materials />
          <CTA />
          <Footer />
        </div>
      </main>
    </SmoothScroll>
  );
}
