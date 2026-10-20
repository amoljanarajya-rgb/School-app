import { useEffect, useMemo, useState } from "react";
import { Plus, UserCog, Trash2, CalendarCheck, CalendarOff, DollarSign, Check, X, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Staff, StaffAttendance, StaffLeave, Payroll, Department } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StatCard } from "@/components/StatCard";
import { FileUpload } from "@/components/FileUpload";
import { formatCurrency, formatDate, classNamesForStatus } from "@/lib/format";

type Tab = "staff" | "attendance" | "leaves" | "payroll";

type StaffRow = Staff & { departments?: Department };

export function HRModule() {
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState<Tab>("staff");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<(StaffAttendance & { staff?: { full_name: string; employee_no: string } })[]>([]);
  const [leaves, setLeaves] = useState<(StaffLeave & { staff?: { full_name: string; employee_no: string } })[]>([]);
  const [payroll, setPayroll] = useState<(Payroll & { staff?: { full_name: string; employee_no: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, a, l, p] = await Promise.all([
      supabase.from("staff").select("*, departments(*)").order("created_at", { ascending: false }),
      supabase.from("staff_attendance").select("*, staff(full_name, employee_no)").order("attendance_date", { ascending: false }).limit(50),
      supabase.from("staff_leaves").select("*, staff(full_name, employee_no)").order("created_at", { ascending: false }),
      supabase.from("payroll").select("*, staff(full_name, employee_no)").order("pay_period_year", { ascending: false }).order("pay_period_month", { ascending: false }),
    ]);
    const firstError = [s, a, l, p].find((r) => r.error);
    if (firstError?.error) setError(firstError.error.message);
    else {
      setStaff((s.data ?? []) as StaffRow[]);
      setAttendance((a.data ?? []) as typeof attendance);
      setLeaves((l.data ?? []) as typeof leaves);
      setPayroll((p.data ?? []) as typeof payroll);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const teaching = staff.filter((s) => s.staff_type === "Teaching").length;
    const active = staff.filter((s) => s.status === "Active").length;
    const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;
    const paidPayroll = payroll.filter((p) => p.status === "Paid").length;
    return { teaching, active, pendingLeaves, paidPayroll };
  }, [staff, leaves, payroll]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Human Resource</h2>
        <p className="text-slate-500 mt-1">Staff profiles, bulk attendance toggles, leave approval workflow, and payroll setup.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Staff" value={staff.length} hint={`${stats.active} active`} tone="info" icon={<UserCog size={20} />} />
        <StatCard label="Teaching Staff" value={stats.teaching} tone="success" icon={<UserCog size={20} />} />
        <StatCard label="Pending Leaves" value={stats.pendingLeaves} tone="warning" icon={<CalendarOff size={20} />} />
        <StatCard label="Payroll Paid" value={stats.paidPayroll} hint={`${payroll.length} total records`} tone="success" icon={<DollarSign size={20} />} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["staff", "Staff"], ["attendance", "Attendance"], ["leaves", "Leaves"], ["payroll", "Payroll"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm">{error}</div>
      ) : tab === "staff" ? (
        <StaffPanel staff={staff} lookups={lookups} onChanged={load} />
      ) : tab === "attendance" ? (
        <AttendancePanel attendance={attendance} staff={staff} onChanged={load} />
      ) : tab === "leaves" ? (
        <LeavesPanel leaves={leaves} staff={staff} onChanged={load} />
      ) : (
        <PayrollPanel payroll={payroll} staff={staff} onChanged={load} />
      )}
    </div>
  );
}

function StaffPanel({ staff, lookups, onChanged }: { staff: StaffRow[]; lookups: ReturnType<typeof useLookups>["data"]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_no: "", full_name: "", local_name: "", department_id: "", designation: "",
    staff_type: "Teaching" as Staff["staff_type"], gender: "Male" as Staff["gender"],
    date_of_birth: "", hire_date: new Date().toISOString().slice(0, 10),
    phone: "", email: "", address: "", salary: "", status: "Active" as Staff["status"],
    photo_url: "" as string | null,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ employee_no: "", full_name: "", local_name: "", department_id: "", designation: "", staff_type: "Teaching", gender: "Male", date_of_birth: "", hire_date: new Date().toISOString().slice(0, 10), phone: "", email: "", address: "", salary: "", status: "Active", photo_url: null });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (s: StaffRow) => {
    setEditing(s);
    setForm({
      employee_no: s.employee_no, full_name: s.full_name, local_name: s.local_name ?? "",
      department_id: s.department_id ?? "", designation: s.designation ?? "",
      staff_type: s.staff_type, gender: s.gender ?? "Male",
      date_of_birth: s.date_of_birth ?? "", hire_date: s.hire_date, phone: s.phone ?? "",
      email: s.email ?? "", address: s.address ?? "", salary: s.salary?.toString() ?? "",
      status: s.status, photo_url: s.photo_url ?? null,
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!form.employee_no.trim() || !form.full_name.trim() || !form.salary) throw new Error("Employee no, name and salary are required.");
      const payload = {
        employee_no: form.employee_no.trim(), full_name: form.full_name.trim(),
        local_name: form.local_name || null, department_id: form.department_id || null,
        designation: form.designation || null, staff_type: form.staff_type,
        gender: form.gender || null, date_of_birth: form.date_of_birth || null,
        hire_date: form.hire_date, phone: form.phone || null, email: form.email || null,
        address: form.address || null, salary: Number(form.salary), status: form.status,
        photo_url: form.photo_url || null,
      };
      if (editing) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload);
        if (error) throw error;
      }
      setOpen(false);
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: StaffRow) => {
    if (!confirm(`Delete ${s.full_name}?`)) return;
    await supabase.from("staff").delete().eq("id", s.id);
    onChanged();
  };

  const deptName = (id: string) => lookups?.departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Staff Directory</h3>
        <Button onClick={openNew}><Plus size={16} /> Add Staff</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Employee No</th>
              <th className="text-left font-medium px-4 py-3">Name</th>
              <th className="text-left font-medium px-4 py-3">Department</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Salary</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.employee_no}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {s.photo_url ? (
                      <img src={s.photo_url.startsWith("http") ? s.photo_url : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/erp-uploads/${s.photo_url}`} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-200" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-semibold">{s.full_name.charAt(0).toUpperCase()}</div>
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.designation ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{deptName(s.department_id ?? "")}</td>
                <td className="px-4 py-3"><Badge tone={s.staff_type === "Teaching" ? "info" : "neutral"}>{s.staff_type}</Badge></td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(s.salary)}</td>
                <td className="px-4 py-3"><Badge tone={classNamesForStatus(s.status)}>{s.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-600 mr-1"><PencilIcon /></button>
                  <button onClick={() => remove(s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Staff" : "Add Staff Member"} size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Add"}</Button></div>}>
        {formError && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="shrink-0">
            <FileUpload folder="staff" value={form.photo_url} onChange={(p) => setForm({ ...form, photo_url: p })} label="Staff Photo" hint="JPG/PNG, up to 5 MB" variant="photo" />
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Employee No" required value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} />
            <Field label="Full Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Field label="Name (Local Language)" value={form.local_name} onChange={(e) => setForm({ ...form, local_name: e.target.value })} placeholder="देवनागरी में नाम" className="font-devanagari" />
            <SelectField label="Department" placeholder="Select department" options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.type})` }))} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} />
            <Field label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <SelectField label="Staff Type" options={[{ value: "Teaching", label: "Teaching" }, { value: "Non-Teaching", label: "Non-Teaching" }]} value={form.staff_type} onChange={(e) => setForm({ ...form, staff_type: e.target.value as Staff["staff_type"] })} />
            <SelectField label="Gender" options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value as Staff["gender"] })} />
            <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            <Field label="Hire Date" type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            <Field label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Field label="Salary" required type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            <SelectField label="Status" options={["Active", "Inactive", "On Leave", "Terminated", "Retired"].map((s) => ({ value: s, label: s }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Staff["status"] })} />
            <TextareaField label="Address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="sm:col-span-2" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PencilIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
}

// ============ Bulk Attendance with toggles ============

type BulkAttendanceEntry = { staff_id: string; status: StaffAttendance["status"]; check_in: string; check_out: string };

function AttendancePanel({ attendance, staff, onChanged }: { attendance: (StaffAttendance & { staff?: { full_name: string; employee_no: string } })[]; staff: StaffRow[]; onChanged: () => void }) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkEntries, setBulkEntries] = useState<BulkAttendanceEntry[]>([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leave: 0 });
  const [singleForm, setSingleForm] = useState({
    staff_id: "", attendance_date: new Date().toISOString().slice(0, 10),
    status: "Present" as StaffAttendance["status"], check_in_time: "", check_out_time: "", remarks: "",
  });

  const openBulk = () => {
    setBulkDate(new Date().toISOString().slice(0, 10));
    setBulkEntries(staff.map((s) => ({ staff_id: s.id, status: "Present" as StaffAttendance["status"], check_in: "08:00", check_out: "16:00" })));
    setSummary({ present: staff.length, absent: 0, leave: 0 });
    setBulkOpen(true);
  };

  const toggleStatus = (staffId: string, status: StaffAttendance["status"]) => {
    setBulkEntries((prev) => prev.map((e) => (e.staff_id === staffId ? { ...e, status } : e)));
    setSummary({
      present: bulkEntries.filter((e) => (e.staff_id === staffId ? status === "Present" : e.status === "Present")).length,
      absent: bulkEntries.filter((e) => (e.staff_id === staffId ? status === "Absent" : e.status === "Absent")).length,
      leave: bulkEntries.filter((e) => (e.staff_id === staffId ? status === "Half Day" : e.status === "Half Day")).length,
    });
  };

  const setAll = (status: StaffAttendance["status"]) => {
    setBulkEntries((prev) => prev.map((e) => ({ ...e, status })));
    setSummary({
      present: status === "Present" ? staff.length : 0,
      absent: status === "Absent" ? staff.length : 0,
      leave: status === "Half Day" ? staff.length : 0,
    });
  };

  const saveBulk = async () => {
    setSaving(true);
    try {
      // Delete existing attendance for this date first (upsert pattern)
      await supabase.from("staff_attendance").delete().eq("attendance_date", bulkDate);
      const inserts = bulkEntries.map((e) => ({
        staff_id: e.staff_id,
        attendance_date: bulkDate,
        status: e.status,
        check_in_time: e.status === "Present" || e.status === "Late" ? e.check_in || null : null,
        check_out_time: e.status === "Present" || e.status === "Late" ? e.check_out || null : null,
      }));
      const { error } = await supabase.from("staff_attendance").insert(inserts);
      if (error) throw error;
      setBulkOpen(false);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const saveSingle = async () => {
    setSaving(true);
    try {
      if (!singleForm.staff_id) throw new Error("Select a staff member.");
      const { error } = await supabase.from("staff_attendance").insert({
        staff_id: singleForm.staff_id,
        attendance_date: singleForm.attendance_date,
        status: singleForm.status,
        check_in_time: singleForm.check_in_time || null,
        check_out_time: singleForm.check_out_time || null,
        remarks: singleForm.remarks || null,
      });
      if (error) throw error;
      setSingleOpen(false);
      setSingleForm({ staff_id: "", attendance_date: new Date().toISOString().slice(0, 10), status: "Present", check_in_time: "", check_out_time: "", remarks: "" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const statusToggle = (status: StaffAttendance["status"], current: StaffAttendance["status"]) => {
    const styles: Record<StaffAttendance["status"], string> = {
      Present: "bg-emerald-500 text-white",
      Absent: "bg-rose-500 text-white",
      Late: "bg-amber-500 text-white",
      "Half Day": "bg-sky-500 text-white",
    };
    const inactive: Record<StaffAttendance["status"], string> = {
      Present: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
      Absent: "bg-rose-50 text-rose-600 hover:bg-rose-100",
      Late: "bg-amber-50 text-amber-600 hover:bg-amber-100",
      "Half Day": "bg-sky-50 text-sky-600 hover:bg-sky-100",
    };
    return styles[status] === current || current === status ? styles[status] : inactive[status];
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Daily Attendance</h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSingleOpen(true)}><Plus size={16} /> Single Entry</Button>
          <Button onClick={openBulk}><CalendarCheck size={16} /> Bulk Mark</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Employee</th>
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3">Check In</th>
              <th className="text-left font-medium px-4 py-3">Check Out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attendance.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-900">{a.staff?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{a.staff?.employee_no ?? ""}</p></td>
                <td className="px-4 py-3 text-slate-600">{formatDate(a.attendance_date)}</td>
                <td className="px-4 py-3"><Badge tone={classNamesForStatus(a.status)}>{a.status}</Badge></td>
                <td className="px-4 py-3 text-slate-600">{a.check_in_time ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{a.check_out_time ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk attendance modal */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk Attendance Entry"
        description="Toggle Present / Absent / Leave for all staff at once."
        size="xl"
        footer={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check size={14} /> {summary.present} Present</span>
              <span className="inline-flex items-center gap-1.5 text-rose-700"><X size={14} /> {summary.absent} Absent</span>
              <span className="inline-flex items-center gap-1.5 text-sky-700"><Clock size={14} /> {summary.leave} Half Day</span>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button onClick={saveBulk} disabled={saving}>{saving ? "Saving…" : "Save Attendance"}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Date" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="w-auto" />
            <div className="flex items-end gap-2">
              <button onClick={() => setAll("Present")} className="text-xs px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">Mark all Present</button>
              <button onClick={() => setAll("Absent")} className="text-xs px-3 py-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium">Mark all Absent</button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Employee</th>
                  <th className="text-left font-medium px-4 py-2">Dept</th>
                  <th className="text-center font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => {
                  const entry = bulkEntries.find((e) => e.staff_id === s.id);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-900">{s.full_name}</p>
                        <p className="text-xs text-slate-500">{s.employee_no}</p>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{s.designation ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-center gap-1">
                          {(["Present", "Absent", "Half Day", "Late"] as StaffAttendance["status"][]).map((st) => (
                            <button
                              key={st}
                              onClick={() => toggleStatus(s.id, st)}
                              className={`text-xs px-2.5 py-1 rounded-md font-medium transition ${entry?.status === st ? statusToggle(st, st) : statusToggle(st, entry?.status ?? "Present")}`}
                            >
                              {st === "Half Day" ? "Half" : st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Single entry modal */}
      <Modal open={singleOpen} onClose={() => setSingleOpen(false)} title="Mark Single Attendance" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSingleOpen(false)}>Cancel</Button><Button onClick={saveSingle} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>}>
        <div className="space-y-4">
          <SelectField label="Staff" required placeholder="Select staff" options={staff.map((s) => ({ value: s.id, label: `${s.full_name} (${s.employee_no})` }))} value={singleForm.staff_id} onChange={(e) => setSingleForm({ ...singleForm, staff_id: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" type="date" value={singleForm.attendance_date} onChange={(e) => setSingleForm({ ...singleForm, attendance_date: e.target.value })} />
            <SelectField label="Status" options={["Present", "Absent", "Half Day", "Late"].map((s) => ({ value: s, label: s }))} value={singleForm.status} onChange={(e) => setSingleForm({ ...singleForm, status: e.target.value as StaffAttendance["status"] })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Check In" type="time" value={singleForm.check_in_time} onChange={(e) => setSingleForm({ ...singleForm, check_in_time: e.target.value })} />
            <Field label="Check Out" type="time" value={singleForm.check_out_time} onChange={(e) => setSingleForm({ ...singleForm, check_out_time: e.target.value })} />
          </div>
          <TextareaField label="Remarks" rows={2} value={singleForm.remarks} onChange={(e) => setSingleForm({ ...singleForm, remarks: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ============ Leaves with approval workflow ============

function LeavesPanel({ leaves, staff, onChanged }: { leaves: (StaffLeave & { staff?: { full_name: string; employee_no: string } })[]; staff: StaffRow[]; onChanged: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    staff_id: "", leave_type: "Casual" as StaffLeave["leave_type"],
    start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10),
    reason: "", status: "Pending" as StaffLeave["status"],
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.staff_id) throw new Error("Select a staff member.");
      if (form.end_date < form.start_date) throw new Error("End date cannot be before start date.");
      const { error } = await supabase.from("staff_leaves").insert({
        staff_id: form.staff_id, leave_type: form.leave_type,
        start_date: form.start_date, end_date: form.end_date,
        reason: form.reason || null, status: form.status,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ staff_id: "", leave_type: "Casual", start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: "", status: "Pending" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: StaffLeave["status"]) => {
    const { error } = await supabase.from("staff_leaves").update({ status }).eq("id", id);
    if (error) { alert(error.message); return; }
    onChanged();
  };

  const leaveDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Leave Applications & Approval</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Apply Leave</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Staff</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Duration</th>
              <th className="text-left font-medium px-4 py-3">Days</th>
              <th className="text-left font-medium px-4 py-3">Reason</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Workflow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaves.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-900">{l.staff?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{l.staff?.employee_no ?? ""}</p></td>
                <td className="px-4 py-3"><Badge tone="info">{l.leave_type}</Badge></td>
                <td className="px-4 py-3 text-slate-600">{formatDate(l.start_date)} → {formatDate(l.end_date)}</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{leaveDays(l.start_date, l.end_date)}</td>
                <td className="px-4 py-3 text-slate-600 truncate max-w-xs block">{l.reason ?? "—"}</td>
                <td className="px-4 py-3"><Badge tone={classNamesForStatus(l.status)}>{l.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  {l.status === "Pending" && (
                    <div className="inline-flex gap-1">
                      <button onClick={() => updateStatus(l.id, "Approved")} className="text-xs px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium inline-flex items-center gap-1"><Check size={12} /> {t("approve")}</button>
                      <button onClick={() => updateStatus(l.id, "Rejected")} className="text-xs px-2.5 py-1 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 font-medium inline-flex items-center gap-1"><X size={12} /> {t("reject")}</button>
                    </div>
                  )}
                  {l.status === "Approved" && <span className="text-xs text-emerald-600">Approved</span>}
                  {l.status === "Rejected" && <span className="text-xs text-rose-600">Rejected</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for Leave" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Submit"}</Button></div>}>
        <div className="space-y-4">
          <SelectField label="Staff" required placeholder="Select staff" options={staff.map((s) => ({ value: s.id, label: `${s.full_name} (${s.employee_no})` }))} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} />
          <SelectField label="Leave Type" options={["Casual", "Sick", "Earned", "Maternity", "Unpaid"].map((tp) => ({ value: tp, label: tp }))} value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value as StaffLeave["leave_type"] })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Field label="End Date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <TextareaField label="Reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ============ Payroll with salary setup ============

function PayrollPanel({ payroll, staff, onChanged }: { payroll: (Payroll & { staff?: { full_name: string; employee_no: string } })[]; staff: StaffRow[]; onChanged: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const now = new Date();
  const [form, setForm] = useState({
    staff_id: "", pay_period_month: now.getMonth() + 1, pay_period_year: now.getFullYear(),
    basic_salary: "", allowances: "", deductions: "", payment_date: "", status: "Pending" as Payroll["status"],
  });

  // Auto-fill basic salary from staff record
  useEffect(() => {
    if (form.staff_id) {
      const s = staff.find((st) => st.id === form.staff_id);
      if (s) {
        setForm((prev) => ({
          ...prev,
          basic_salary: s.salary?.toString() ?? "",
          allowances: (s.salary ? Math.round(s.salary * 0.15) : 0).toString(),
          deductions: (s.salary ? Math.round(s.salary * 0.08) : 0).toString(),
        }));
      }
    }
  }, [form.staff_id, staff]);

  const netSalary = (Number(form.basic_salary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0);

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!form.staff_id || !form.basic_salary) throw new Error("Staff and basic salary are required.");
      if (Number(form.basic_salary) < 0) throw new Error("Basic salary cannot be negative.");
      const { error } = await supabase.from("payroll").insert({
        staff_id: form.staff_id,
        pay_period_month: Number(form.pay_period_month),
        pay_period_year: Number(form.pay_period_year),
        basic_salary: Number(form.basic_salary),
        allowances: Number(form.allowances) || 0,
        deductions: Number(form.deductions) || 0,
        payment_date: form.payment_date || null,
        status: form.status,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ staff_id: "", pay_period_month: now.getMonth() + 1, pay_period_year: now.getFullYear(), basic_salary: "", allowances: "", deductions: "", payment_date: "", status: "Pending" });
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: Payroll["status"]) => {
    const update: Record<string, unknown> = { status };
    if (status === "Paid") update.payment_date = new Date().toISOString().slice(0, 10);
    await supabase.from("payroll").update(update).eq("id", id);
    onChanged();
  };

  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "short" });

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Payroll & Salary Distribution</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Payroll</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Staff</th>
              <th className="text-left font-medium px-4 py-3">Period</th>
              <th className="text-left font-medium px-4 py-3">Basic</th>
              <th className="text-left font-medium px-4 py-3">Allow.</th>
              <th className="text-left font-medium px-4 py-3">Deduct.</th>
              <th className="text-left font-medium px-4 py-3">Net</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payroll.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-900">{p.staff?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{p.staff?.employee_no ?? ""}</p></td>
                <td className="px-4 py-3 text-slate-600">{monthName(p.pay_period_month)} {p.pay_period_year}</td>
                <td className="px-4 py-3 text-slate-700">{formatCurrency(p.basic_salary)}</td>
                <td className="px-4 py-3 text-emerald-600">{formatCurrency(p.allowances)}</td>
                <td className="px-4 py-3 text-rose-600">{formatCurrency(p.deductions)}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(p.net_salary)}</td>
                <td className="px-4 py-3"><Badge tone={classNamesForStatus(p.status)}>{p.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  {p.status === "Pending" && <button onClick={() => updateStatus(p.id, "Processed")} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Process</button>}
                  {p.status === "Processed" && <button onClick={() => updateStatus(p.id, "Paid")} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Mark Paid</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Payroll Record" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>}>
        {formError && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="space-y-4">
          <SelectField label="Staff" required placeholder="Select staff" options={staff.map((s) => ({ value: s.id, label: `${s.full_name} (${s.employee_no})` }))} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} hint="Salary auto-fills from staff profile" />
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Month" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i, 1).toLocaleString("en-US", { month: "long" }) }))} value={String(form.pay_period_month)} onChange={(e) => setForm({ ...form, pay_period_month: Number(e.target.value) })} />
            <Field label="Year" type="number" value={form.pay_period_year} onChange={(e) => setForm({ ...form, pay_period_year: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label={t("basic_salary")} required type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} />
            <Field label={t("allowances")} type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} />
            <Field label={t("deductions")} type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
          </div>
          <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">{t("net_salary")}</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(netSalary)}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Payment Date" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            <SelectField label="Status" options={["Pending", "Processed", "Paid"].map((s) => ({ value: s, label: s }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Payroll["status"] })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
