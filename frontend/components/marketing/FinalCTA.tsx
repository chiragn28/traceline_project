import ScrollReveal from "./ScrollReveal";
import MagneticButton from "./MagneticButton";

export default function FinalCTA() {
  return (
    <section className="border-t border-slate-200 py-24 dark:border-zinc-800">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <ScrollReveal className="flex flex-col items-center">
          <h2 className="max-w-[20ch] text-[clamp(1.6rem,3vw,2.4rem)] font-semibold tracking-tight text-ink dark:text-zinc-50">
            Start your first review cycle.
          </h2>
          <p className="mt-3 text-[15px] text-slate-600 dark:text-zinc-400">
            Sign in to see your own data sources, not a demo.
          </p>
          <div className="mt-8">
            <MagneticButton href="/login">Sign in</MagneticButton>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
