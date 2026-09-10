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
    <div className="min-h-screen bg-paper text-ink dark:bg-zinc-950 dark:text-zinc-50">
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
