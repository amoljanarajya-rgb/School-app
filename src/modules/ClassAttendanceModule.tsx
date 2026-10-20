import { useEffect, useMemo, useState } from "react";
import { Check, X, Clock, CalendarOff, Save, Users, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Student, StudentAttendance as AttendanceRow } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { formatDate, classNamesForStatus } from "@/lib/format";
import { cn } from "@/lib/cn";

type Status = AttendanceRow["status"];

type StudentWithGuardian = Student & {
  guardians?: { full_name: string; phone: string | null } | null;
};

export function ClassAttendanceModule() {
  const { data: lookups, loading: lookupsLoading } = useLookups();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<StudentWithGuardian[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Status>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<(AttendanceRow & { students?: { full_name: string; admission_no: string } })[]>([]);

  const sectionOptions = useMemo(
    () => (lookups?.sections ?? []).filter((s) => s.class_id === classId).map((s) => ({ value: s.id, label: `Section ${s.name}` })),
    [lookups, classId],
  );

  // Load students when class/section changes
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
        // Default everyone to Present
        const initial: Record<string, Status> = {};
        (data ?? []).forEach((s: StudentWithGuardian) => {
          initial[s.id] = "Present";
        });
        setAttendance(initial);
      }
      setLoadingStudents(false);
    });
  }, [classId, sectionId]);

  // Load existing attendance for this date + class
  useEffect(() => {
    if (!classId || !date) return;
    supabase
      .from("student_attendance")
      .select("*, students(full_name, admission_no)")
      .eq("class_id", classId)
      .eq("attendance_date", date)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setHistory((data ?? []) as (AttendanceRow & { students?: { full_name: string; admission_no: string } })[]);
        // Merge existing statuses into the toggle map
        if (data && data.length > 0) {
          setAttendance((prev) => {
            const next = { ...prev };
            (data as (AttendanceRow & { students?: { full_name: string; admission_no: string } })[]).forEach((row) => {
              next[row.student_id] = row.status;
            });
            return next;
          });
        }
      });
  }, [classId, date]);

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
    try {
      // Delete existing attendance for this class+date, then re-insert (upsert pattern)
      await supabase.from("student_attendance").delete().eq("class_id", classId).eq("attendance_date", date);
      const inserts = students.map((s) => ({
        student_id: s.id,
        class_id: classId,
        section_id: sectionId || null,
        attendance_date: date,
        status: attendance[s.id] ?? "Present",
      }));
      const { error } = await supabase.from("student_attendance").insert(inserts);
      if (error) throw error;
      setSavedMsg(`Saved attendance for ${students.length} students.`);
      // Refresh history
      const { data } = await supabase
        .from("student_attendance")
        .select("*, students(full_name, admission_no)")
        .eq("class_id", classId)
        .eq("attendance_date", date)
        .order("created_at", { ascending: false })
        .limit(200);
      setHistory((data ?? []) as (AttendanceRow & { students?: { full_name: string; admission_no: string } })[]);
    } catch (e) {
      setSavedMsg(null);
      alert(e instanceof Error ? e.message : "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const statuses: Status[] = ["Present", "Absent", "Late", "Leave"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Class-wise Attendance</h2>
        <p className="text-slate-500 mt-1">Mark daily attendance by class and section with bulk toggles.</p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Summary stats */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryPill label="Total" value={summary.total} icon={<Users size={15} />} tone="neutral" />
          <SummaryPill label="Present" value={summary.present} icon={<Check size={15} />} tone="success" />
          <SummaryPill label="Absent" value={summary.absent} icon={<X size={15} />} tone="error" />
          <SummaryPill label="Late" value={summary.late} icon={<Clock size={15} />} tone="warning" />
          <SummaryPill label="Leave" value={summary.leave} icon={<CalendarOff size={15} />} tone="info" />
        </div>
      )}

      {/* Bulk toggle bar */}
      {students.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500 mr-1">Bulk:</span>
          <button onClick={() => setAll("Present")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">All Present</button>
          <button onClick={() => setAll("Absent")} className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium">All Absent</button>
          <button onClick={() => setAll("Late")} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">All Late</button>
          <button onClick={() => setAll("Leave")} className="text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium">All Leave</button>
          <div className="ml-auto">
            <Button onClick={save} disabled={saving || !classId}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Attendance
            </Button>
          </div>
        </div>
      )}

      {savedMsg && (
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-700">{savedMsg}</div>
      )}

      {/* Student list with toggles */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        {loadingStudents ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading students…</div>
        ) : !classId ? (
          <div className="p-10 text-center text-slate-400 text-sm">Select a class to load students.</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No students found in this class/section.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Roll</th>
                  <th className="text-left font-medium px-4 py-3">Name</th>
                  <th className="text-left font-medium px-4 py-3">Guardian</th>
                  <th className="text-center font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{s.roll_no ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.admission_no}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.guardians?.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {statuses.map((st) => (
                          <button
                            key={st}
                            onClick={() => setStatus(s.id, st)}
                            className={cn(
                              "text-xs px-2.5 py-1 rounded-md font-medium transition",
                              attendance[s.id] === st
                                ? st === "Present" ? "bg-emerald-500 text-white"
                                  : st === "Absent" ? "bg-rose-500 text-white"
                                  : st === "Late" ? "bg-amber-500 text-white"
                                  : "bg-sky-500 text-white"
                                : st === "Present" ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                  : st === "Absent" ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                                  : st === "Late" ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                  : "bg-sky-50 text-sky-600 hover:bg-sky-100",
                            )}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Today's history */}
      {history.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Attendance History — {formatDate(date)}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Student</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.slice(0, 30).map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{h.students?.full_name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{h.students?.admission_no ?? ""}</p>
                    </td>
                    <td className="px-4 py-3"><Badge tone={classNamesForStatus(h.status)}>{h.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{h.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
    <div className={cn("rounded-xl ring-1 px-4 py-3 flex items-center gap-3", tones[tone])}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  );
}
