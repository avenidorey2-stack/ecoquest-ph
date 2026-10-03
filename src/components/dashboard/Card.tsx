import Link from "next/link";

/** Dashboard card frame: uppercase eyebrow title, optional action link, padded body. */
export default function Card({
  title,
  icon,
  action,
  className = "",
  bodyClassName = "p-5",
  tour,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
  bodyClassName?: string;
  /** `data-tour` key: the guided tour spotlights this card. */
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-tour={tour}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.08)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {icon && <span className="text-emerald-600">{icon}</span>}
          {title}
        </h2>
        {action && (
          <Link href={action.href} className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
            {action.label}
          </Link>
        )}
      </header>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function ProgressBar({ value, max, tone = "emerald" }: { value: number; max: number; tone?: "emerald" | "amber" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`eq-fill h-full rounded-full transition-[width] duration-700 ${tone === "amber" ? "bg-amber-400" : "bg-gradient-to-r from-emerald-500 to-emerald-600"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
