import ScrollReveal from "./ScrollReveal";
import MagneticButton from "./MagneticButton";
import DemoCredentials from "./DemoCredentials";

export default function FinalCTA() {
  return (
    <section className="border-t border-slate-200 py-24 dark:border-zinc-800">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <ScrollReveal className="flex flex-col items-center">
          <h2 className="max-w-[20ch] text-[clamp(1.6rem,3vw,2.4rem)] font-semibold tracking-tight text-ink dark:text-zinc-50">
            Click through a real review cycle.
          </h2>
          <p className="mt-3 max-w-[52ch] text-[15px] text-slate-600 dark:text-zinc-400">
            The demo workspace has a seeded Postgres source, tagged tables, a flagged violation and an open review — sign in and try it.
          </p>
          <div className="mt-8 flex flex-col items-center">
            <MagneticButton href="/login">Open the demo</MagneticButton>
            <DemoCredentials align="center" />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
