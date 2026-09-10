import {
  LockKey,
  Fingerprint,
  ShieldCheck,
  SealCheck,
  Eye,
} from "@phosphor-icons/react/dist/ssr";
import ScrollReveal from "./ScrollReveal";

const features = [
  {
    icon: LockKey,
    title: "Immutable decisions",
    body: "Approve or revoke is final for that cycle. A reviewer changing their mind raises a conflict, not a silent overwrite.",
    large: true,
    tint: true,
  },
  {
    icon: Fingerprint,
    title: "Service accounts have owners",
    body: "Every pipeline credential maps to a real person, so review items are never unowned system noise.",
  },
  {
    icon: ShieldCheck,
    title: "Isolation, twice",
    body: "Workspace filtering in the application, enforced again by Postgres row-level security underneath it.",
  },
  {
    icon: SealCheck,
    title: "Tamper-evident exports",
    body: "Every evidence file is hashed and timestamped. Change one byte after export and the hash stops matching.",
    tint: true,
  },
  {
    icon: Eye,
    title: "Passive by design",
    body: "Reads the query log only. No agent in your data plane, no write access, ever requested.",
  },
];

export default function Features() {
  return (
    <section className="border-t border-slate-200 py-20 dark:border-zinc-800 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-10 text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold tracking-tight text-ink dark:text-zinc-50">
          What you get
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <ScrollReveal
                key={f.title}
                delay={i * 0.06}
                className={`rounded-2xl border p-6 ${
                  f.large ? "md:col-span-2" : ""
                } ${
                  f.tint
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                    : "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <Icon size={22} weight="regular" className="text-emerald-700 dark:text-emerald-400" />
                <h3 className="mt-3 text-[15.5px] font-semibold tracking-tight text-ink dark:text-zinc-50">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-400">
                  {f.body}
                </p>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
