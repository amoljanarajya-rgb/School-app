import { Globe, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition"
      >
        <Globe size={16} />
        <span className="uppercase">{current.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl bg-white shadow-xl ring-1 ring-slate-200 py-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-sm",
                lang === l.code ? "text-sky-700 font-medium" : "text-slate-700",
              )}
            >
              <span>
                {l.native} <span className="text-xs text-slate-400">({l.label})</span>
              </span>
              {lang === l.code && <Check size={15} className="text-sky-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
