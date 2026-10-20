import { useEffect, useMemo, useState } from "react";
import { QrCode, Camera, Check, X, Clock, CalendarOff, Save, Users, Loader2, WifiOff, Wifi, CloudUpload, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Student, StudentAttendance as AttendanceRow } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { cn } from "@/lib/cn";
import { useOfflineSync } from "@/lib/useOfflineSync";
import { useQrScanner } from "@/lib/useQrScanner";

type Status = AttendanceRow["status"];

type StudentWithGuardian = Student & {
  guardians?: { full_name: string; phone: string | null } | null;
};

export function TeacherMobilePortal() {
  const { data: lookups, loading: lookupsLoading } = useLookups();
  const { state: syncState, enqueue, triggerSync } = useOfflineSync();
  const qr = useQrScanner();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<StudentWithGuardian[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Status>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanLog, setScanLog] = useState<{ name: string; status: string; time: string }[]>([]);

  const sectionOptions = useMemo(
    () => (lookups?.sections ?? []).filter((s) => s.class_id === classId).map((s) => ({ value: s.id, label: `Section ${s.name}` })),
    [lookups, classId],
  );

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      setAttendance({});
      return;
    }
    setLoadingStudents(true);
    let q = supabase.from("students").select("*, guardians(full_name, phone)").eq("class_id", classId).order("full_name");
    if (sectionId) q = q.eq("section_id", sectionId);
    q.then(({ data, error }) => {
      if (error) {
        setStudents([]);
      } else {
        setStudents((data ?? []) as StudentWithGuardian[]);
        const initial: Record<string, Status> = {};
        (data ?? []).forEach((s: StudentWithGuardian) => { initial[s.id] = "Present"; });
        setAttendance(initial);
      }
      setLoadingStudents(false);
    });
  }, [classId, sectionId]);

  const summary = useMemo(() => {
    const vals = Object.values(attendance);
    return {
      present: vals.filter((v) => v === "Present").length,
      absent: vals.filter((v) => v === "Absent").length,
      late: vals.filter((v) => v === "Late").length,
      leave: vals.filter((v) => v === "Leave").length,
      total: vals.length,
    };
  }, [attendance]);

  const setStatus = (studentId: string, status: Status) => {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const setAll = (status: Status) => {
    const next: Record<string, Status> = {};
    students.forEach((s) => (next[s.id] = status));
    setAttendance(next);
  };

  const save = async () => {
    if (!classId || students.length === 0) return;
    setSaving(true);
    setSavedMsg(null);

    const inserts = students.map((s) => ({
      student_id: s.id,
      class_id: classId,
      section_id: sectionId || null,
      attendance_date: date,
      status: attendance[s.id] ?? "Present",
    }));

    if (syncState.online) {
      try {
        await supabase.from("student_attendance").delete().eq("class_id", classId).eq("attendance_date", date);
        const { error } = await supabase.from("student_attendance").insert(inserts);
        if (error) throw error;
        setSavedMsg(`Saved attendance for ${students.length} students online.`);
      } catch (e) {
        // Fallback: queue offline
        for (const row of inserts) {
          await enqueue({ table: "student_attendance", operation: "insert", payload: row });
        }
        setSavedMsg(`Network error — ${students.length} records saved locally. Will sync when online.`);
      }
    } else {
      // Offline: queue to IndexedDB
      for (const row of inserts) {
        await enqueue({ table: "student_attendance", operation: "insert", payload: row });
      }
      setSavedMsg(`Offline — ${students.length} records saved locally. Pending sync: ${syncState.pending + inserts.length}`);
    }
    setSaving(false);
  };

  const handleQrScan = (text: string) => {
    // QR format: STUDENT:<admission_no>
    const admissionNo = text.startsWith("STUDENT:") ? text.replace("STUDENT:", "") : text;
    const student = students.find((s) => s.admission_no === admissionNo);
    if (student) {
      setStatus(student.id, "Present");
      setScanLog((prev) => [{ name: student.full_name, status: "Present", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 20));
    } else {
      setScanLog((prev) => [{ name: `Unknown: ${admissionNo}`, status: "Not Found", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 20));
    }
  };

  const statuses: Status[] = ["Present", "Absent", "Late", "Leave"];

  return (
    <div className="space-y-5">
      {/* Sync banner */}
      <SyncBanner state={syncState} onSync={triggerSync} />

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Teacher Portal</h2>
        <p className="text-slate-500 mt-1">Quick class-wise attendance with student photo grid and QR scan.</p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectField
            label="Class"
            required
            placeholder="Select class"
            options={(lookups?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}
            disabled={lookupsLoading}
          />
          <SelectField
            label="Section"
            placeholder="All sections"
            options={sectionOptions}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!classId}
          />
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <SummaryPill label="Total" value={summary.total} icon={<Users size={15} />} tone="neutral" />
          <SummaryPill label="Present" value={summary.present} icon={<Check size={15} />} tone="success" />
          <SummaryPill label="Absent" value={summary.absent} icon={<X size={15} />} tone="error" />
          <SummaryPill label="Late" value={summary.late} icon={<Clock size={15} />} tone="warning" />
          <SummaryPill label="Leave" value={summary.leave} icon={<CalendarOff size={15} />} tone="info" />
        </div>
      )}

      {/* Action bar */}
      {students.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => { setScanMode(true); qr.start(handleQrScan); }}>
            <QrCode size={16} /> Scan QR
          </Button>
          <button onClick={() => setAll("Present")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">All Present</button>
          <button onClick={() => setAll("Absent")} className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium">All Absent</button>
          <div className="ml-auto">
            <Button onClick={save} disabled={saving || !classId}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
            </Button>
          </div>
        </div>
      )}

      {savedMsg && (
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-700">{savedMsg}</div>
      )}

      {/* QR Scanner overlay */}
      {scanMode && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2"><QrCode size={20} /> Scan Student QR</h3>
              <button onClick={() => { qr.stop(); setScanMode(false); }} className="text-slate-300 hover:text-white"><X size={24} /></button>
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square ring-2 ring-sky-500/50">
              <video ref={qr.videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-sky-400 rounded-xl" />
              </div>
            </div>
            {qr.error && <p className="text-rose-400 text-sm mt-3">{qr.error}</p>}
            {qr.lastScan && <p className="text-emerald-400 text-sm mt-2">Last scan: {qr.lastScan.text}</p>}
            <div className="mt-4 space-y-1 max-h-32 overflow-y-auto">
              {scanLog.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-slate-800 rounded-lg px-3 py-1.5">
                  <span className="text-slate-200">{entry.name}</span>
                  <span className={cn("text-xs font-medium", entry.status === "Present" ? "text-emerald-400" : "text-rose-400")}>{entry.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Photo grid */}
      {loadingStudents ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading students…</div>
      ) : !classId ? (
        <div className="p-10 text-center text-slate-400 text-sm">Select a class to load students.</div>
      ) : students.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-sm">No students found in this class/section.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {students.map((s) => {
            const st = attendance[s.id] ?? "Present";
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-2xl bg-white ring-1 shadow-sm overflow-hidden transition cursor-pointer",
                  st === "Present" ? "ring-emerald-300" : st === "Absent" ? "ring-rose-300" : st === "Late" ? "ring-amber-300" : "ring-sky-300",
                )}
              >
                {/* Photo */}
                <div className="aspect-square bg-slate-100 relative">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 flex items-center justify-center text-white text-xl font-bold">
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                  {/* Status badge */}
                  <div className="absolute top-2 right-2">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full shadow",
                      st === "Present" ? "bg-emerald-500 text-white" : st === "Absent" ? "bg-rose-500 text-white" : st === "Late" ? "bg-amber-500 text-white" : "bg-sky-500 text-white",
                    )}>{st}</span>
                  </div>
                </div>
                {/* Info */}
                <div className="p-2.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.full_name}</p>
                  <p className="text-[11px] text-slate-500">{s.admission_no} · Roll {s.roll_no ?? "—"}</p>
                  {/* Status toggles */}
                  <div className="mt-2 grid grid-cols-4 gap-0.5">
                    {statuses.map((stOpt) => (
                      <button
                        key={stOpt}
                        onClick={() => setStatus(s.id, stOpt)}
                        className={cn(
                          "text-[10px] py-1 rounded font-medium transition",
                          st === stOpt
                            ? stOpt === "Present" ? "bg-emerald-500 text-white"
                              : stOpt === "Absent" ? "bg-rose-500 text-white"
                              : stOpt === "Late" ? "bg-amber-500 text-white"
                              : "bg-sky-500 text-white"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                        )}
                      >
                        {stOpt.charAt(0)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SyncBanner({ state, onSync }: { state: { online: boolean; syncing: boolean; pending: number; lastSync: string | null; lastError: string | null }; onSync: () => void }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm ring-1",
      state.online ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200",
    )}>
      {state.online ? <Wifi size={16} /> : <WifiOff size={16} />}
      <span className="font-medium">
        {state.online ? "Online" : "Offline"} — {state.pending} record{state.pending !== 1 ? "s" : ""} pending sync
      </span>
      {state.syncing && <Loader2 size={14} className="animate-spin" />}
      {state.lastError && <span className="text-rose-600 text-xs truncate">Last error: {state.lastError}</span>}
      {state.pending > 0 && state.online && (
        <button onClick={onSync} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800">
          <CloudUpload size={14} /> Sync now
        </button>
      )}
    </div>
  );
}

function SummaryPill({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "success" | "error" | "warning" | "info" | "neutral" }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    error: "bg-rose-50 text-rose-700 ring-rose-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
    neutral: "bg-slate-50 text-slate-700 ring-slate-200",
  };
  return (
    <div className={cn("rounded-xl ring-1 px-3 py-2.5 flex items-center gap-2.5", tones[tone])}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-[11px] mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  );
}
