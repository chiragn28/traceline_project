import { Buildings, Briefcase } from "@phosphor-icons/react/dist/ssr";
import ScrollReveal from "./ScrollReveal";

const panels = [
  {
    icon: Buildings,
    title: "Engineering leads, Series A to C",
    body: "Self-hosted or non-standard databases that Vanta's and Drata's native integrations don't reach. The access data already exists, Traceline just turns it into a review your auditor signs off on.",
  },
  {
    icon: Briefcase,
    title: "Fractional CISOs and vCISO firms",
    body: "Running manual access reviews across several clients stops scaling past two or three engagements. One workflow, every client's database.",
  },
];

export default function Audience() {
  return (
    <section className="border-t border-slate-200 py-20 dark:border-zinc-800 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2 md:divide-x md:divide-y-0">
          {panels.map((p, i) => {
            const Icon = p.icon;
            return (
              <ScrollReveal key={p.title} delay={i * 0.1} className="p-9">
                <Icon size={22} weight="regular" className="text-emerald-700 dark:text-emerald-400" />
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink dark:text-zinc-50">
                  {p.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-zinc-400">
                  {p.body}
                </p>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
