import ScrollReveal from "./ScrollReveal";

export default function Problem() {
  return (
    <section className="border-t border-slate-200 py-20 dark:border-zinc-800 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <ScrollReveal>
          <h2 className="max-w-[18ch] text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold tracking-tight text-ink dark:text-zinc-50">
            Nobody reviews access until the audit is due.
          </h2>
          <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-slate-600 dark:text-zinc-400">
            SOC 2 and ISO 27001 both require it every quarter. Most teams
            answer with a spreadsheet somebody builds the night before the
            auditor calls, then forgets until the next deadline.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
