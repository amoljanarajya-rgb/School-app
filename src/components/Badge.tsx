import { cn } from "@/lib/cn";

type Tone = "default" | "success" | "warning" | "error" | "info" | "neutral";

const tones: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-700",
  neutral: "bg-slate-200 text-slate-800",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  info: "bg-sky-100 text-sky-700",
};

export function Badge({ tone = "default", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
