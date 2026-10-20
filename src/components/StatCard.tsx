import { cn } from "@/lib/cn";

type Props = {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
};

const toneStyles: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-slate-900 bg-white ring-slate-200",
  success: "text-emerald-900 bg-emerald-50 ring-emerald-200",
  warning: "text-amber-900 bg-amber-50 ring-amber-200",
  error: "text-rose-900 bg-rose-50 ring-rose-200",
  info: "text-sky-900 bg-sky-50 ring-sky-200",
};

const iconWrap: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-slate-100 text-slate-600",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
  error: "bg-rose-100 text-rose-600",
  info: "bg-sky-100 text-sky-600",
};

export function StatCard({ label, value, icon, hint, tone = "default", className }: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl ring-1 shadow-sm p-5 flex items-start gap-4 transition hover:shadow-md hover:-translate-y-0.5",
        toneStyles[tone],
        className,
      )}
    >
      {icon && (
        <div className={cn("rounded-xl p-2.5", iconWrap[tone])} aria-hidden>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums truncate">{value}</p>
        {hint && <p className="mt-1 text-xs opacity-70 truncate">{hint}</p>}
      </div>
    </div>
  );
}
