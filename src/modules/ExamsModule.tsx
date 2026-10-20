import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GraduationCap, Ticket, CheckCircle2, XCircle, Users, Award, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ExternalExam, ExamEnrollment, Student } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatDate } from "@/lib/format";

type ExamWithCount = ExternalExam & { _count?: number };
type EnrollmentRow = ExamEnrollment & {
  students?: { full_name: string; admission_no: string; class_id: string };
};

type Tab = "exams" | "enrollments" | "results";

export function ExamsModule() {
  const [tab, setTab] = useState<Tab>("exams");
  const [exams, setExams] = useState<ExternalExam[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState("");

  const load = async () => {
    setLoading(true);
    const [e, en] = await Promise.all([
      supabase.from("external_exams").select("*").order("exam_date", { ascending: false }),
      supabase.from("exam_enrollments").select("*, students(full_name, admission_no, class_id)").order("created_at", { ascending: false }),
    ]);
    const firstError = [e, en].find((x) => x.error);
    if (firstError?.error) setError(firstError.error.message);
    else {
      setExams((e.data ?? []) as ExternalExam[]);
      setEnrollments((en.data ?? []) as EnrollmentRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const totalEnrolled = enrollments.length;
    const confirmed = enrollments.filter((e) => e.enrollment_status === "Confirmed").length;
    const passed = enrollments.filter((e) => e.result_status === "Pass").length;
    const upcoming = exams.filter((e) => new Date(e.exam_date) >= new Date()).length;
    return { totalEnrolled, confirmed, passed, upcoming, totalExams: exams.length };
  }, [exams, enrollments]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">External Examinations</h2>
        <p className="text-slate-500 mt-1">Track competitive exams, enrollments, hall tickets, and results.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Exams" value={stats.totalExams} hint={`${stats.upcoming} upcoming`} icon={<GraduationCap size={18} />} />
        <MiniStat label="Enrolled" value={stats.totalEnrolled} icon={<Users size={18} />} />
        <MiniStat label="Confirmed" value={stats.confirmed} icon={<Ticket size={18} />} />
        <MiniStat label="Passed" value={stats.passed} icon={<Award size={18} />} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["exams", "Exam Catalog"], ["enrollments", "Enrollments"], ["results", "Results"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm">{error}</div>
      ) : tab === "exams" ? (
        <ExamsPanel exams={exams} onChanged={load} />
      ) : tab === "enrollments" ? (
        <EnrollmentsPanel exams={exams} enrollments={enrollments} onChanged={load} selectedExamId={selectedExamId} setSelectedExamId={setSelectedExamId} />
      ) : (
        <ResultsPanel exams={exams} enrollments={enrollments} onChanged={load} />
      )}
    </div>
  );
}

function ExamsPanel({ exams, onChanged }: { exams: ExternalExam[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", exam_code: "", exam_type: "Scholarship" as ExternalExam["exam_type"],
    exam_date: new Date().toISOString().slice(0, 10), registration_deadline: "", exam_center: "", description: "",
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.name.trim() || !form.exam_code.trim() || !form.exam_date) throw new Error("Name, exam code, and exam date are required.");
      const { error } = await supabase.from("external_exams").insert({
        name: form.name.trim(),
        exam_code: form.exam_code.trim().toUpperCase(),
        exam_type: form.exam_type,
        exam_date: form.exam_date,
        registration_deadline: form.registration_deadline || null,
        exam_center: form.exam_center || null,
        description: form.description || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ name: "", exam_code: "", exam_type: "Scholarship", exam_date: new Date().toISOString().slice(0, 10), registration_deadline: "", exam_center: "", description: "" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this exam? All enrollments will be removed.")) return;
    await supabase.from("external_exams").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Exam Catalog</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Exam</Button>
      </div>
      <div className="overflow-x-auto">
        {exams.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No external exams registered.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Exam</th>
                <th className="text-left font-medium px-4 py-3">Code</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Exam Date</th>
                <th className="text-left font-medium px-4 py-3">Reg. Deadline</th>
                <th className="text-left font-medium px-4 py-3">Center</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams.map((e) => {
                const upcoming = new Date(e.exam_date) >= new Date();
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{e.name}</p>
                      {e.description && <p className="text-xs text-slate-500 truncate max-w-xs">{e.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.exam_code}</td>
                    <td className="px-4 py-3"><Badge tone="info">{e.exam_type}</Badge></td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(e.exam_date)} {upcoming && <span className="ml-1 text-xs text-emerald-600">upcoming</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(e.registration_deadline)}</td>
                    <td className="px-4 py-3 text-slate-600">{e.exam_center ?? "—"}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add External Exam" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Exam Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. National Science Olympiad" />
          <Field label="Exam Code" required value={form.exam_code} onChange={(e) => setForm({ ...form, exam_code: e.target.value })} placeholder="e.g. NSO-2026" />
          <SelectField label="Exam Type" options={["Scholarship", "Olympiad", "NTSE", "Drawing", "Other"].map((t) => ({ value: t, label: t }))} value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value as ExternalExam["exam_type"] })} />
          <Field label="Exam Date" required type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
          <Field label="Registration Deadline" type="date" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} />
          <Field label="Exam Center" value={form.exam_center} onChange={(e) => setForm({ ...form, exam_center: e.target.value })} placeholder="e.g. City Hall, Mumbai" />
          <div className="sm:col-span-2">
            <TextareaField label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EnrollmentsPanel({ exams, enrollments, onChanged, selectedExamId, setSelectedExamId }: {
  exams: ExternalExam[];
  enrollments: EnrollmentRow[];
  onChanged: () => void;
  selectedExamId: string;
  setSelectedExamId: (v: string) => void;
}) {
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [hallTicket, setHallTicket] = useState("");
  const [examCenter, setExamCenter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = selectedExamId ? enrollments.filter((e) => e.exam_id === selectedExamId) : enrollments;

  const enroll = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedExamId || !selectedStudent) throw new Error("Select an exam and a student.");
      const { error } = await supabase.from("exam_enrollments").upsert({
        exam_id: selectedExamId,
        student_id: selectedStudent.id,
        hall_ticket_no: hallTicket || null,
        exam_center: examCenter || null,
        enrollment_status: "Registered",
        result_status: "Pending",
      }, { onConflict: "exam_id,student_id" });
      if (error) throw error;
      setSelectedStudent(null);
      setHallTicket("");
      setExamCenter("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmEnrollment = async (id: string) => {
    await supabase.from("exam_enrollments").update({ enrollment_status: "Confirmed" }).eq("id", id);
    onChanged();
  };

  const cancelEnrollment = async (id: string) => {
    await supabase.from("exam_enrollments").update({ enrollment_status: "Cancelled" }).eq("id", id);
    onChanged();
  };

  const generateHallTicket = async (row: EnrollmentRow) => {
    const ticket = `HT-${row.exam_id.slice(0, 4).toUpperCase()}-${row.student_id.slice(0, 4).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from("exam_enrollments").update({ hall_ticket_no: ticket, enrollment_status: "Confirmed" }).eq("id", row.id);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this enrollment?")) return;
    await supabase.from("exam_enrollments").delete().eq("id", id);
    onChanged();
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Enrollment form */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Ticket size={18} className="text-sky-600" /> Enroll Student in Exam</h3>
        {error && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="Exam" required placeholder="Select exam" options={exams.map((e) => ({ value: e.id, label: `${e.name} (${e.exam_code})` }))} value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)} />
          <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} label="Student" />
          <Field label="Hall Ticket No" value={hallTicket} onChange={(e) => setHallTicket(e.target.value)} placeholder="Auto-generated if blank" />
          <Field label="Exam Center" value={examCenter} onChange={(e) => setExamCenter(e.target.value)} placeholder={selectedExam?.exam_center ?? "Enter center"} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={enroll} disabled={saving || !selectedExamId || !selectedStudent}>{saving ? "Enrolling…" : "Enroll Student"}</Button>
        </div>
      </div>

      {/* Enrollment list */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Enrollments {selectedExam && <span className="text-sm font-normal text-slate-400">— {selectedExam.name}</span>}</h3>
          {selectedExamId && <button onClick={() => setSelectedExamId("")} className="text-xs text-sky-600 hover:text-sky-700 font-medium">Clear filter</button>}
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No enrollments yet.</p> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Student</th>
                  <th className="text-left font-medium px-4 py-3">Hall Ticket</th>
                  <th className="text-left font-medium px-4 py-3">Center</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-right font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((en) => (
                  <tr key={en.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{en.students?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{en.students?.admission_no ?? ""}</p></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{en.hall_ticket_no ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{en.exam_center ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={en.enrollment_status === "Confirmed" ? "success" : en.enrollment_status === "Cancelled" ? "error" : "warning"}>{en.enrollment_status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {!en.hall_ticket_no && <button onClick={() => generateHallTicket(en)} className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200" title="Generate hall ticket">Ticket</button>}
                        {en.enrollment_status === "Registered" && <button onClick={() => confirmEnrollment(en.id)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Confirm</button>}
                        {en.enrollment_status !== "Cancelled" && <button onClick={() => cancelEnrollment(en.id)} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Cancel</button>}
                        <button onClick={() => remove(en.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ exams, enrollments, onChanged }: { exams: ExternalExam[]; enrollments: EnrollmentRow[]; onChanged: () => void }) {
  const [examId, setExamId] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const filtered = examId ? enrollments.filter((e) => e.exam_id === examId && e.enrollment_status !== "Cancelled") : enrollments.filter((e) => e.enrollment_status !== "Cancelled");

  const updateResult = async (id: string, field: "result_status" | "marks", value: string) => {
    setSaving((p) => ({ ...p, [id]: true }));
    const update: Record<string, unknown> = { [field]: field === "marks" ? (value ? Number(value) : null) : value };
    await supabase.from("exam_enrollments").update(update).eq("id", id);
    setSaving((p) => ({ ...p, [id]: false }));
    onChanged();
  };

  const examName = (id: string) => exams.find((e) => e.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <SelectField label="Filter by Exam" placeholder="All exams" options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={(e) => setExamId(e.target.value)} />
      </div>
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Publish Results</h3>
          <p className="text-xs text-slate-500 mt-0.5">Enter marks and set result status for each enrolled student.</p>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No enrollments to publish results for.</p> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Student</th>
                  <th className="text-left font-medium px-4 py-3">Exam</th>
                  <th className="text-left font-medium px-4 py-3 w-32">Marks</th>
                  <th className="text-left font-medium px-4 py-3 w-36">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((en) => (
                  <tr key={en.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{en.students?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{en.students?.admission_no ?? ""}</p></td>
                    <td className="px-4 py-3 text-slate-600">{examName(en.exam_id)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={en.marks ?? ""}
                        onBlur={(e) => updateResult(en.id, "marks", e.target.value)}
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={en.result_status ?? "Pending"}
                        onChange={(e) => updateResult(en.id, "result_status", e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="Absent">Absent</option>
                      </select>
                      {en.result_status === "Pass" && <CheckCircle2 size={14} className="inline ml-2 text-emerald-500" />}
                      {en.result_status === "Fail" && <XCircle size={14} className="inline ml-2 text-rose-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint, icon }: { label: string; value: number; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium text-slate-500">{label}</span></div>
      <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
