import { useEffect, useState } from "react";
import { Printer, CheckCircle2, XCircle, Monitor } from "lucide-react";
import { getPrinterStatus, isDesktop } from "@/lib/desktopPrinter";
import { cn } from "@/lib/cn";

export function PrinterStatusBar() {
  const [status, setStatus] = useState<"checking" | "connected" | "browser">("checking");
  const [printerName, setPrinterName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isDesktop()) {
        if (active) setStatus("browser");
        return;
      }
      const s = await getPrinterStatus();
      if (!active) return;
      if (s.connected) {
        setStatus("connected");
        setPrinterName(s.name ?? null);
      } else {
        setStatus("browser");
      }
    })();
    return () => { active = false; };
  }, []);

  const config = {
    checking: { icon: <Monitor size={13} />, label: "Detecting printer…", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
    connected: { icon: <CheckCircle2 size={13} />, label: printerName ? `Thermal: ${printerName}` : "Thermal printer ready", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    browser: { icon: <Printer size={13} />, label: "Browser print mode", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  }[status];

  return (
    <span className={cn("hidden xl:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", config.cls)}>
      {config.icon}
      {config.label}
    </span>
  );
}

export function PrintToast({ result, onDismiss }: { result: { ok: boolean; error?: string } | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [result, onDismiss]);

  if (!result) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-in slide-in-from-bottom-2">
      <div className={cn(
        "flex items-start gap-3 rounded-xl shadow-lg ring-1 p-4 max-w-sm",
        result.ok ? "bg-white ring-emerald-200" : "bg-white ring-rose-200",
      )}>
        {result.ok ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={20} className="text-rose-500 shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", result.ok ? "text-emerald-700" : "text-rose-700")}>
            {result.ok ? "Sent to thermal printer" : "Print failed"}
          </p>
          {!result.ok && result.error && <p className="text-xs text-slate-500 mt-0.5">{result.error}</p>}
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Dismiss">
          <XCircle size={16} />
        </button>
      </div>
    </div>
  );
}
