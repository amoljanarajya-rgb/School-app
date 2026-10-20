import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

export type StudentSearchResult = {
  id: string;
  full_name: string;
  admission_no: string;
  class_name?: string;
};

type Props = {
  selected: StudentSearchResult | null;
  onSelect: (s: StudentSearchResult | null) => void;
  label?: string;
};

export function StudentSearchBar({ selected, onSelect, label = "Student" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, admission_no, classes(name)")
        .or(`full_name.ilike.%${query}%,admission_no.ilike.%${query}%`)
        .limit(8);
      setResults(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          full_name: r.full_name as string,
          admission_no: r.admission_no as string,
          class_name: (r.classes as { name: string } | null)?.name,
        })),
      );
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selected) {
    return (
      <div>
        <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
        <div className="flex items-center gap-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2">
          <div className="h-9 w-9 rounded-full bg-sky-200 text-sky-700 flex items-center justify-center text-xs font-semibold">
            {selected.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">{selected.full_name}</p>
            <p className="text-xs text-slate-500">
              {selected.admission_no}
              {selected.class_name && ` · ${selected.class_name}`}
            </p>
          </div>
          <button
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
            className="text-slate-400 hover:text-rose-600"
            aria-label="Clear"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or admission no…"
          className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
        />
      </div>
      {open && (query.trim().length >= 2 || loading) && (
        <div className="absolute z-30 top-full mt-1 w-full rounded-xl bg-white shadow-xl ring-1 ring-slate-200 py-1.5 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-3 text-sm text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">No students found.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3 transition",
                )}
              >
                <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold shrink-0">
                  {r.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {r.admission_no}
                    {r.class_name && ` · ${r.class_name}`}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
