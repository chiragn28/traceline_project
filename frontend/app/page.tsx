import MarketingNav from "@/components/marketing/MarketingNav";
import Hero from "@/components/marketing/Hero";
import Problem from "@/components/marketing/Problem";
import HowItWorks from "@/components/marketing/HowItWorks";
import Audience from "@/components/marketing/Audience";
import Features from "@/components/marketing/Features";
import TerminalPanel from "@/components/marketing/TerminalPanel";
import FinalCTA from "@/components/marketing/FinalCTA";
import Footer from "@/components/marketing/Footer";

export default function RootPage() {
  return (
    // Dark mode is scoped to this subtree (see app/layout.tsx) rather than
    // the shared <body>, so the dashboard app never inherits it.
    <div className="relative min-h-screen bg-paper text-ink dark:bg-zinc-950 dark:text-zinc-50">
      {/* Site-wide dot-grid texture, fixed so it doesn't repaint on scroll.
          Previously a line-grid lived only inside Hero at 5% opacity,
          masked to fade out within one section -- everything below it
          (most of the page) was flat, textureless white, and even inside
          the hero the pattern was too faint to actually read as a texture.
          Dots read as texture at an opacity lines would look like graph
          paper at, and echo the trace-node motif in the logo mark. A
          second, sparser layer in the accent color ties it to the brand
          instead of leaving it a generic technical texture.
          TerminalPanel's own solid dark background occludes it there,
          which is fine -- that section already has the terminal window. */}
      {/* z-index intentionally omitted: a negative z-index on a `fixed`
          element painted *behind* body's own solid background-color in
          Chromium's stacking resolution, making the whole pattern
          invisible even though the computed style looked correct.
          Auto z-index plus being first in DOM order is both simpler and
          actually renders -- everything real is a later sibling, which is
          enough to paint on top without fighting stacking contexts. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(15,23,42,0.16)_1px,transparent_1px)] bg-[size:26px_26px] dark:bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(16,185,129,0.35)_1.5px,transparent_1.5px)] bg-[size:104px_104px] bg-[position:13px_13px] dark:bg-[radial-gradient(rgba(52,211,153,0.3)_1.5px,transparent_1.5px)]"
      />
      <MarketingNav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Audience />
        <Features />
        <TerminalPanel />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
