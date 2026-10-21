import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, UserCheck, Plus, Trash2, Grid3x3, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TimetableEntry, TimetableSubstitution } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField } from "@/components/Field";
import { cn } from "@/lib/cn";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NUMS = [1, 2, 3, 4, 5, 6];

type EntryWithTeacher = TimetableEntry & { staff?: { full_name: string } | null };

export function TimetableModule() {
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState<"timetable" | "substitutions">("timetable");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");
  const [teacherId, setTeacherId] = useState("");
  const [entries, setEntries] = useState<EntryWithTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [subs, setSubs] = useState<(TimetableSubstitution & {
    original_teacher?: { full_name: string } | null;
    substitute_teacher?: { full_name: string } | null;
    timetable_entries?: { subject: string; class_id: string; period: number; day_of_week: number } | null;
  })[]>([]);
  const [subTab, setSubTab] = useState<"list" | "auto">("auto");
  const [absentTeacher, setAbsentTeacher] = useState("");
  const [subDate, setSubDate] = useState(new Date().toISOString().slice(0, 10));
  const [availableTeachers, setAvailableTeachers] = useState<{ id: string; full_name: string }[]>([]);
  const [busySlots, setBusySlots] = useState<Set<number>>(new Set());

  const teachingStaff = useMemo(
    () => (lookups?.staff ?? []).filter((s) => s.staff_type === "Teaching"),
    [lookups],
  );

  const sections = useMemo(
    () => (lookups?.sections ?? []).filter((s) => s.class_id === classId),
    [lookups, classId],
  );

  const loadEntries = () => {
    if (viewMode === "class" && !classId) return;
    if (viewMode === "teacher" && !teacherId) return;
    setLoading(true);
    let q = supabase.from("timetable_entries").select("*, staff(full_name)").order("day_of_week").order("period");
    if (viewMode === "class") {
      q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);
    } else {
      q = q.eq("teacher_id", teacherId);
    }
    q.then(({ data, error }) => {
      if (!error) setEntries((data ?? []) as EntryWithTeacher[]);
      setLoading(false);
    });
  };

  useEffect(() => { loadEntries(); }, [classId, sectionId, teacherId, viewMode]);

  const loadSubs = () => {
    supabase
      .from("timetable_substitutions")
      .select("*, original_teacher:staff!original_teacher_id(full_name), substitute_teacher:staff!substitute_teacher_id(full_name), timetable_entries(subject, class_id, period, day_of_week)")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setSubs((data ?? []) as typeof subs));
  };

  useEffect(() => { loadSubs(); }, []);

  // Auto-substitution: find available teachers
  const findAvailableTeachers = async () => {
    if (!absentTeacher) return;
    const dayNum = new Date(subDate + "T00:00:00").getDay();
    // Get absent teacher's slots for that day
    const { data: absentSlots } = await supabase
      .from("timetable_entries")
      .select("period, day_of_week")
      .eq("teacher_id", absentTeacher)
      .eq("day_of_week", dayNum);
    const absentPeriods = new Set((absentSlots ?? []).map((s) => s.period));
    setBusySlots(absentPeriods);
    // Get all busy teachers at those same periods on that day
    const { data: busyData } = await supabase
      .from("timetable_entries")
      .select("teacher_id, period")
      .eq("day_of_week", dayNum)
      .in("period", [...absentPeriods]);
    const busyTeacherPeriods = new Map<string, Set<number>>();
    (busyData ?? []).forEach((b) => {
      if (!busyTeacherPeriods.has(b.teacher_id)) busyTeacherPeriods.set(b.teacher_id, new Set());
      busyTeacherPeriods.get(b.teacher_id)!.add(b.period);
    });
    // Available = teaching staff who are free for ALL absent periods
    const available = teachingStaff.filter((s) => {
      if (s.id === absentTeacher) return false;
      const busy = busyTeacherPeriods.get(s.id);
      if (!busy) return true;
      return [...absentPeriods].every((p) => !busy.has(p));
    });
    setAvailableTeachers(available.map((s) => ({ id: s.id, full_name: s.full_name })));
  };

  const assignSubstitute = async (entryId: string, subTeacherId: string, reason: string) => {
    await supabase.from("timetable_substitutions").insert({
      timetable_entry_id: entryId,
      original_teacher_id: absentTeacher,
      substitute_teacher_id: subTeacherId,
      date: subDate,
      reason,
      status: "Assigned",
    });
    loadSubs();
  };

  const grid = useMemo(() => {
    const map = new Map<string, EntryWithTeacher>();
    entries.forEach((e) => {
      const key = `${e.day_of_week}-${e.period}`;
      map.set(key, e);
    });
    return map;
  }, [entries]);

  const maxPeriod = useMemo(() => Math.max(8, ...entries.map((e) => e.period)), [entries]);

  const deleteEntry = async (id: string) => {
    await supabase.from("timetable_entries").delete().eq("id", id);
    loadEntries();
  };

  const tabs = [
    { key: "timetable" as const, label: "Timetable", icon: <Grid3x3 size={16} /> },
    { key: "substitutions" as const, label: "Substitutions", icon: <UserCheck size={16} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "timetable" && (
        <>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <SelectField label="View Mode" value={viewMode} onChange={(e) => { setViewMode(e.target.value as "class" | "teacher"); }}
                options={[{ value: "class", label: "Class View" }, { value: "teacher", label: "Teacher View" }]} />
              {viewMode === "class" ? (
                <>
                  <SelectField label="Class" placeholder="Select class" value={classId}
                    onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}
                    options={(lookups?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
                  <SelectField label="Section" placeholder="All sections" value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    options={sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))} />
                </>
              ) : (
                <SelectField label="Teacher" placeholder="Select teacher" value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  options={teachingStaff.map((s) => ({ value: s.id, label: s.full_name }))} />
              )}
              <div className="flex items-end gap-2">
                <Button variant="secondary" onClick={() => loadEntries()}><RefreshCw size={14} /> Refresh</Button>
                <Button onClick={() => setAddOpen(true)}><Plus size={14} /> Add</Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Loading timetable…</div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No timetable entries found. Click "Add" to create one.</div>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-20">Period</th>
                    {DAYS.map((d) => (
                      <th key={d} className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[140px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => (
                    <tr key={period} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-500 text-xs">P{period}</td>
                      {DAY_NUMS.map((day) => {
                        const entry = grid.get(`${day}-${period}`);
                        return (
                          <td key={day} className="px-2 py-1.5">
                            {entry ? (
                              <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 p-2 group relative">
                                <p className="font-medium text-sky-900 text-xs truncate">{entry.subject}</p>
                                <p className="text-[11px] text-slate-500 truncate">{entry.staff?.full_name}</p>
                                {entry.room_no && <p className="text-[10px] text-slate-400">Room {entry.room_no}</p>}
                                <button onClick={() => deleteEntry(entry.id)}
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 transition">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="h-full min-h-[44px] rounded-lg bg-slate-50" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "substitutions" && (
        <>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit">
            <button onClick={() => setSubTab("auto")} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", subTab === "auto" ? "bg-white shadow-sm" : "text-slate-500")}>Auto-Substitute</button>
            <button onClick={() => setSubTab("list")} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", subTab === "list" ? "bg-white shadow-sm" : "text-slate-500")}>History</button>
          </div>

          {subTab === "auto" && (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SelectField label="Absent Teacher" placeholder="Select teacher" value={absentTeacher}
                  onChange={(e) => setAbsentTeacher(e.target.value)}
                  options={teachingStaff.map((s) => ({ value: s.id, label: s.full_name }))} />
                <Field label="Date" type="date" value={subDate} onChange={(e) => setSubDate(e.target.value)} />
                <div className="flex items-end">
                  <Button onClick={findAvailableTeachers} disabled={!absentTeacher}>
                    <Search size={14} /> Find Available Teachers
                  </Button>
                </div>
              </div>

              {busySlots.size > 0 && (
                <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-700">
                  Teacher is absent for periods: {[...busySlots].sort((a, b) => a - b).map((p) => `P${p}`).join(", ")}
                </div>
              )}

              {availableTeachers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Available Substitute Teachers ({availableTeachers.length})</h3>
                  <div className="space-y-2">
                    {availableTeachers.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg ring-1 ring-slate-200 px-4 py-2.5">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold">
                          {t.full_name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-slate-800 flex-1">{t.full_name}</span>
                        <Button variant="secondary" onClick={() => {
                          const entryId = entries.find((e) => e.teacher_id === absentTeacher && busySlots.has(e.period))?.id;
                          if (entryId) assignSubstitute(entryId, t.id, "Teacher absent");
                        }}>
                          <UserCheck size={14} /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {subTab === "list" && (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Original Teacher</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Substitute</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Reason</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No substitutions yet.</td></tr>
                  ) : subs.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{s.date}</td>
                      <td className="px-4 py-3 text-slate-700">{s.original_teacher?.full_name}</td>
                      <td className="px-4 py-3 text-slate-700">{s.substitute_teacher?.full_name}</td>
                      <td className="px-4 py-3 text-slate-500">{s.reason ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tone={s.status === "Completed" ? "success" : s.status === "Declined" ? "error" : "info"}>{s.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <AddEntryModal open={addOpen} onClose={() => setAddOpen(false)} classId={classId} sectionId={sectionId}
        classes={lookups?.classes ?? []} sections={sections} staff={teachingStaff}
        onSaved={() => { setAddOpen(false); loadEntries(); }} />
    </div>
  );
}

function AddEntryModal({ open, onClose, classId, sectionId, classes, sections, staff, onSaved }: {
  open: boolean; onClose: () => void; classId: string; sectionId: string;
  classes: { id: string; name: string }[]; sections: { id: string; name: string }[];
  staff: { id: string; full_name: string }[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({ class_id: classId, section_id: sectionId, teacher_id: "", subject: "", day_of_week: "1", period: "1", start_time: "08:00", end_time: "08:45", room_no: "" });

  useEffect(() => { setForm((f) => ({ ...f, class_id: classId, section_id: sectionId })); }, [classId, sectionId]);

  const save = async () => {
    if (!form.class_id || !form.teacher_id || !form.subject) return;
    await supabase.from("timetable_entries").insert({
      ...form,
      day_of_week: Number(form.day_of_week),
      period: Number(form.period),
      section_id: form.section_id || null,
      room_no: form.room_no || null,
      is_break: false,
    });
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Timetable Entry" size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save Entry</Button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
          options={classes.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select class" />
        <SelectField label="Section" value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
          options={sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))} placeholder="All sections" />
        <SelectField label="Teacher" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
          options={staff.map((s) => ({ value: s.id, label: s.full_name }))} placeholder="Select teacher" />
        <Field label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
        <SelectField label="Day" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
          options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />
        <SelectField label="Period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
          options={Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Period ${i + 1}` }))} />
        <Field label="Start Time" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        <Field label="End Time" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
        <Field label="Room No" value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} placeholder="e.g. 101" />
      </div>
    </Modal>
  );
}
