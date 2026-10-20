import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Bot, User, TrendingUp, Bus, GraduationCap, Clock, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type Message = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type Trigger = {
  id: string;
  label: string;
  query: string;
  icon: React.ReactNode;
};

const TRIGGERS: Trigger[] = [
  { id: "attendance", label: "Today's class-wise attendance", query: "Ask AI: Today's class-wise attendance", icon: <Clock size={14} /> },
  { id: "buses", label: "Bus routes status", query: "Ask AI: Bus routes status", icon: <Bus size={14} /> },
  { id: "exams", label: "Upcoming external exams", query: "Ask AI: Upcoming external exams", icon: <GraduationCap size={14} /> },
  { id: "finance", label: "Fee collection summary", query: "Ask AI: Fee collection summary", icon: <TrendingUp size={14} /> },
];

const GREETING = "Hi! I'm your school assistant. I can pull live data on attendance, buses, exams, and fees. Try a quick trigger below or ask me anything.";

export function AIAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING, ts: Date.now() }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const runQuery = async (query: string) => {
    const userMsg: Message = { role: "user", content: query, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    const answer = await answerQuery(query);

    setThinking(false);
    setMessages((prev) => [...prev, { role: "assistant", content: answer, ts: Date.now() }]);
  };

  return (
    <>
      {/* Floating launcher button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 rounded-full p-4 shadow-lg shadow-violet-900/30 bg-gradient-to-br from-violet-600 to-indigo-700 text-white hover:scale-105 transition-transform",
          open && "hidden",
        )}
        aria-label="Open AI Assistant"
      >
        <Sparkles size={22} />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-96 max-h-[75vh] flex flex-col rounded-2xl bg-slate-900 ring-1 ring-slate-700 shadow-2xl shadow-violet-950/40 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-700 to-indigo-800 text-white">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-white/15 p-1.5"><Bot size={18} /></span>
              <div>
                <p className="font-semibold text-sm leading-none">School AI Assistant</p>
                <p className="text-[10px] text-violet-200 mt-1 leading-none">Live data · Always on</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/15 transition"><X size={18} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-900">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                <span className={cn("shrink-0 rounded-lg p-1.5", m.role === "assistant" ? "bg-violet-600/30 text-violet-300" : "bg-sky-600/30 text-sky-300")}>
                  {m.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
                </span>
                <div className={cn("rounded-xl px-3 py-2 text-sm whitespace-pre-wrap max-w-[80%]", m.role === "assistant" ? "bg-slate-800 text-slate-100" : "bg-sky-600 text-white")}>
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex gap-2">
                <span className="shrink-0 rounded-lg p-1.5 bg-violet-600/30 text-violet-300"><Bot size={14} /></span>
                <div className="rounded-xl px-3 py-2 bg-slate-800 text-slate-400 text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce [animation-delay:-0.3s]">•</span>
                    <span className="animate-bounce [animation-delay:-0.15s]">•</span>
                    <span className="animate-bounce">•</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick triggers */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 bg-slate-900">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Quick triggers</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TRIGGERS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => runQuery(t.query)}
                    className="text-left text-xs rounded-lg bg-slate-800 hover:bg-slate-700 ring-1 ring-slate-700 px-2.5 py-2 text-slate-200 transition flex items-center gap-1.5"
                  >
                    <span className="text-violet-400">{t.icon}</span>
                    <span className="leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-slate-700 bg-slate-900">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) runQuery(input.trim()); }}
              placeholder="Ask about attendance, buses, exams…"
              className="flex-1 rounded-lg bg-slate-800 ring-1 ring-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-violet-500"
            />
            <button
              onClick={() => input.trim() && runQuery(input.trim())}
              disabled={!input.trim() || thinking}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2 transition"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Pulls live data from Supabase based on the query keywords. */
async function answerQuery(query: string): Promise<string> {
  const q = query.toLowerCase();

  try {
    if (q.includes("attendance")) {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("student_attendance")
        .select("status, class_id, students(full_name)")
        .eq("attendance_date", today);
      const rows = (data ?? []) as unknown as { status: string; class_id: string; students?: { full_name: string } | null }[];
      if (rows.length === 0) return "No attendance has been marked yet today. Use the Class-wise Attendance module to mark students.";
      const present = rows.filter((r) => r.status === "Present").length;
      const absent = rows.filter((r) => r.status === "Absent").length;
      const late = rows.filter((r) => r.status === "Late").length;
      const leave = rows.filter((r) => r.status === "Leave").length;
      const rate = Math.round((present / rows.length) * 100);
      const absentees = rows.filter((r) => r.status === "Absent").slice(0, 5).map((r) => r.students?.full_name ?? "Unknown");
      return `Today's attendance (${rows.length} students marked):\n• Present: ${present} (${rate}%)\n• Absent: ${absent}\n• Late: ${late}\n• Leave: ${leave}${absentees.length > 0 ? `\n\nAbsentees: ${absentees.join(", ")}` : ""}`;
    }

    if (q.includes("bus") || q.includes("route") || q.includes("transport")) {
      const [buses, routes, mappings] = await Promise.all([
        supabase.from("buses").select("bus_no, status, capacity, driver_name"),
        supabase.from("bus_routes").select("route_name, bus_id"),
        supabase.from("student_bus_mappings").select("id"),
      ]);
      const busRows = (buses.data ?? []) as { bus_no: string; status: string; capacity: number; driver_name: string }[];
      const routeRows = (routes.data ?? []) as { route_name: string; bus_id: string }[];
      const mappingCount = (mappings.data ?? []).length;
      const active = busRows.filter((b) => b.status === "Active").length;
      const totalCap = busRows.reduce((s, b) => s + b.capacity, 0);
      return `Transport fleet status:\n• ${busRows.length} buses registered (${active} active)\n• ${routeRows.length} routes defined\n• Total capacity: ${totalCap} seats\n• ${mappingCount} students assigned to buses\n\nActive buses: ${busRows.filter((b) => b.status === "Active").map((b) => b.bus_no).join(", ") || "none"}`;
    }

    if (q.includes("exam")) {
      const { data } = await supabase
        .from("external_exams")
        .select("name, exam_code, exam_type, exam_date, registration_deadline")
        .order("exam_date", { ascending: true });
      const rows = (data ?? []) as { name: string; exam_code: string; exam_type: string; exam_date: string; registration_deadline: string | null }[];
      if (rows.length === 0) return "No external exams are registered yet. Add exams in the External Examinations module.";
      const upcoming = rows.filter((r) => new Date(r.exam_date) >= new Date());
      const list = upcoming.slice(0, 5).map((r) => `• ${r.name} (${r.exam_type}) — ${new Date(r.exam_date).toLocaleDateString("en-IN")}${r.registration_deadline ? `, reg. by ${new Date(r.registration_deadline).toLocaleDateString("en-IN")}` : ""}`);
      return `Upcoming external exams (${upcoming.length} upcoming, ${rows.length} total):\n${list.join("\n") || "• No upcoming exams scheduled."}`;
    }

    if (q.includes("fee") || q.includes("finance") || q.includes("collection")) {
      const today = new Date().toISOString().slice(0, 10);
      const [todayCol, allCol] = await Promise.all([
        supabase.from("fee_collections").select("amount").gte("payment_date", today),
        supabase.from("fee_collections").select("amount"),
      ]);
      const todaySum = ((todayCol.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
      const allSum = ((allCol.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
      const todayCount = (todayCol.data ?? []).length;
      return `Fee collection summary:\n• Collected today: ₹${todaySum.toLocaleString("en-IN")} (${todayCount} receipts)\n• Total collected: ₹${allSum.toLocaleString("en-IN")}\n• Total receipts: ${(allCol.data ?? []).length}`;
    }

    // Fallback: general help
    return `I can answer questions about:\n• Today's class-wise attendance\n• Bus routes and transport status\n• Upcoming external exams\n• Fee collection summaries\n\nTry one of the quick triggers above or ask using keywords like "attendance", "bus", "exam", or "fee".`;
  } catch {
    return "I had trouble fetching that data just now. Please try again in a moment.";
  }
}
