import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, Pencil, Trash2, MapPin, Phone, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Student, Guardian, Class, Section, FeeStructure } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { FileUpload } from "@/components/FileUpload";
import { BilingualInput } from "@/components/BilingualInput";
import { publicUrl } from "@/lib/storage";
import { formatCurrency, formatDate, classNamesForStatus } from "@/lib/format";

type StudentRow = Student & {
  classes?: Class;
  sections?: Section;
  guardians?: Guardian;
};

const EMPTY_FORM = {
  admission_no: "",
  full_name: "",
  local_name: "",
  roll_no: "",
  class_id: "",
  section_id: "",
  gender: "Male" as "Male" | "Female" | "Other",
  date_of_birth: "",
  admission_date: new Date().toISOString().slice(0, 10),
  blood_group: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  guardian_id: "",
  guardian_name: "",
  guardian_local_name: "",
  guardian_relationship: "Father",
  guardian_phone: "",
  guardian_email: "",
  guardian_occupation: "",
  enrollment_status: "Active" as Student["enrollment_status"],
  photo_url: "" as string | null,
  fee_tier_id: "",
};

export function StudentsModule() {
  const { data: lookups, loading: lookupsLoading } = useLookups();
  const { t } = useLang();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  const loadStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("*, classes(*), sections(*), guardians(*)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setStudents((data ?? []) as StudentRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
    supabase.from("fee_structures").select("*").eq("academic_year", "2026-2027").then(({ data }) => {
      if (data) setFeeStructures(data as FeeStructure[]);
    });
  }, []);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (query) {
        const q = query.toLowerCase();
        if (!s.full_name.toLowerCase().includes(q) && !s.admission_no.toLowerCase().includes(q)) return false;
      }
      if (statusFilter && s.enrollment_status !== statusFilter) return false;
      if (classFilter && s.class_id !== classFilter) return false;
      return true;
    });
  }, [students, query, statusFilter, classFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (s: StudentRow) => {
    setEditing(s);
    setForm({
      admission_no: s.admission_no,
      full_name: s.full_name,
      local_name: s.local_name ?? "",
      roll_no: s.roll_no?.toString() ?? "",
      class_id: s.class_id,
      section_id: s.section_id ?? "",
      gender: s.gender,
      date_of_birth: s.date_of_birth,
      admission_date: s.admission_date,
      blood_group: s.blood_group ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      postal_code: s.postal_code ?? "",
      guardian_id: s.guardian_id ?? "",
      guardian_name: s.guardians?.full_name ?? "",
      guardian_local_name: s.guardians?.local_name ?? "",
      guardian_relationship: s.guardians?.relationship ?? "Father",
      guardian_phone: s.guardians?.phone ?? "",
      guardian_email: s.guardians?.email ?? "",
      guardian_occupation: s.guardians?.occupation ?? "",
      enrollment_status: s.enrollment_status,
      photo_url: s.photo_url ?? null,
      fee_tier_id: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const remove = async (s: StudentRow) => {
    if (!confirm(`Delete ${s.full_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from("students").delete().eq("id", s.id);
    if (error) {
      alert(error.message);
      return;
    }
    setStudents((prev) => prev.filter((p) => p.id !== s.id));
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!form.admission_no.trim() || !form.full_name.trim() || !form.class_id || !form.date_of_birth) {
        throw new Error(t("admission_no") + ", " + t("full_name") + ", " + t("class") + " & " + t("date_of_birth") + " are required.");
      }

      let guardianId = form.guardian_id || null;
      if (form.guardian_name.trim()) {
        if (guardianId) {
          const { error: gErr } = await supabase
            .from("guardians")
            .update({
              full_name: form.guardian_name,
              local_name: form.guardian_local_name || null,
              relationship: form.guardian_relationship,
              phone: form.guardian_phone || null,
              email: form.guardian_email || null,
              occupation: form.guardian_occupation || null,
            })
            .eq("id", guardianId);
          if (gErr) throw gErr;
        } else {
          const { data: gData, error: gErr } = await supabase
            .from("guardians")
            .insert({
              full_name: form.guardian_name,
              local_name: form.guardian_local_name || null,
              relationship: form.guardian_relationship,
              phone: form.guardian_phone || null,
              email: form.guardian_email || null,
              occupation: form.guardian_occupation || null,
            })
            .select("id")
            .single();
          if (gErr) throw gErr;
          guardianId = gData.id;
        }
      }

      const payload = {
        admission_no: form.admission_no.trim(),
        full_name: form.full_name.trim(),
        local_name: form.local_name || null,
        roll_no: form.roll_no ? Number(form.roll_no) : null,
        class_id: form.class_id,
        section_id: form.section_id || null,
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        admission_date: form.admission_date,
        blood_group: form.blood_group || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        postal_code: form.postal_code || null,
        guardian_id: guardianId,
        enrollment_status: form.enrollment_status,
        photo_url: form.photo_url || null,
      };

      if (editing) {
        const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      await loadStudents();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save student.");
    } finally {
      setSaving(false);
    }
  };

  const classOptions = (lookups?.classes ?? []).map((c) => ({ value: c.id, label: c.name }));
  const sectionOptions = (lookups?.sections ?? [])
    .filter((s) => s.class_id === form.class_id)
    .map((s) => ({ value: s.id, label: `Section ${s.name}` }));

  // Fee tier: structures matching the selected class
  const feeTiersForClass = feeStructures.filter((f) => f.class_id === form.class_id);
  const selectedTier = feeTiersForClass.find((f) => f.id === form.fee_tier_id);
  const feeTierOptions = feeTiersForClass.map((f) => {
    const cat = lookups?.feeCategories.find((c) => c.id === f.category_id)?.name ?? "Fee";
    return { value: f.id, label: `${cat} — ${formatCurrency(f.amount)}` };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{t("student_information") ?? "Student Management"}</h2>
          <p className="text-slate-500 mt-1">Admission forms, enrollment status, guardian details, and fee tier assignment.</p>
        </div>
        <Button onClick={openNew} disabled={lookupsLoading}>
          <Plus size={16} /> New Admission
        </Button>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or admission no…"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
            />
          </div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">All classes</option>
            {classOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">All status</option>
            {["Active", "Inactive", "Graduated", "Transferred", "Suspended"].map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading students…</div>
        ) : error ? (
          <div className="p-6 text-rose-700 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={32} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No students match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Admission No</th>
                  <th className="text-left font-medium px-4 py-3">Name</th>
                  <th className="text-left font-medium px-4 py-3">Class</th>
                  <th className="text-left font-medium px-4 py-3">Roll</th>
                  <th className="text-left font-medium px-4 py-3">Guardian</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.admission_no}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {s.photo_url ? (
                          <img src={publicUrl(s.photo_url)} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-200" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-semibold">
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{s.full_name}</p>
                          {s.local_name && <p className="text-xs text-slate-500 font-devanagari">{s.local_name}</p>}
                          {!s.local_name && <p className="text-xs text-slate-500 capitalize">{s.gender} · DOB {formatDate(s.date_of_birth)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{s.classes?.name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{s.sections ? `Sec ${s.sections.name}` : "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.roll_no ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{s.guardians?.full_name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{s.guardians?.phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={classNamesForStatus(s.enrollment_status)}>{s.enrollment_status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-600" aria-label="Edit">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => remove(s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600" aria-label="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Student" : "New Admission"}
        description="Fill in the admission form. Fields with local language support are paired with a Devanagari input."
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update Student" : "Admit Student"}</Button>
          </div>
        }
      >
        {formError && (
          <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{formError}</div>
        )}

        {/* Photo + Personal details */}
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="shrink-0">
            <FileUpload
              folder="students"
              value={form.photo_url}
              onChange={(p) => setForm({ ...form, photo_url: p })}
              label={t("profile_photo")}
              hint="JPG/PNG, up to 5 MB"
              variant="photo"
            />
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("admission_no")} required value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} />
            <Field label={t("roll_no")} type="number" value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
            <SelectField label={t("class")} required placeholder="Select class" options={classOptions} value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: "", fee_tier_id: "" })} />
            <SelectField label={t("section")} placeholder="Select section" options={sectionOptions} value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} />
            <SelectField label={t("gender")} options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Student["gender"] })} />
            <Field label={t("date_of_birth")} required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            <Field label={t("admission_date")} type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
            <Field label={t("blood_group")} value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} />
            <SelectField label={t("enrollment_status")} options={["Active", "Inactive", "Graduated", "Transferred", "Suspended"].map((s) => ({ value: s, label: s }))} value={form.enrollment_status} onChange={(e) => setForm({ ...form, enrollment_status: e.target.value as Student["enrollment_status"] })} />
          </div>
        </div>

        {/* Bilingual name */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BilingualInput
              label={t("full_name")}
              localLabel={t("local_name")}
              value={form.full_name}
              localValue={form.local_name}
              onChange={(v) => setForm({ ...form, full_name: v })}
              onLocalChange={(v) => setForm({ ...form, local_name: v })}
              required
              placeholder="e.g. Aarav Sharma"
              localPlaceholder="देवनागरी में नाम दर्ज करें"
            />
          </div>
        </div>

        {/* Fee Tier Assignment */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Wallet size={16} className="text-sky-600" /> {t("fee_tier")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Fee Tier (optional)"
              placeholder="Select fee structure for this class"
              options={feeTierOptions}
              value={form.fee_tier_id}
              onChange={(e) => setForm({ ...form, fee_tier_id: e.target.value })}
              hint={selectedTier ? `Amount: ${formatCurrency(selectedTier.amount)}` : undefined}
            />
            <div className="flex items-end">
              {selectedTier ? (
                <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 px-4 py-2.5 text-sm w-full">
                  <p className="text-sky-700 font-medium">
                    {lookups?.feeCategories.find((c) => c.id === selectedTier.category_id)?.name ?? "Fee"}: {formatCurrency(selectedTier.amount)}
                  </p>
                  {selectedTier.due_date && <p className="text-xs text-sky-600 mt-0.5">Due: {formatDate(selectedTier.due_date)}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Select a class first to see applicable fee tiers.</p>
              )}
            </div>
          </div>
        </div>

        {/* Guardian */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Phone size={16} className="text-sky-600" /> {t("guardian_info")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <BilingualInput
              label={t("guardian_name")}
              localLabel={t("local_name")}
              value={form.guardian_name}
              localValue={form.guardian_local_name}
              onChange={(v) => setForm({ ...form, guardian_name: v })}
              onLocalChange={(v) => setForm({ ...form, guardian_local_name: v })}
              placeholder="e.g. Rajesh Sharma"
              localPlaceholder="अभिभावक का नाम (देवनागरी)"
            />
            <SelectField label={t("relationship")} options={["Father", "Mother", "Guardian", "Grandparent", "Sibling"].map((r) => ({ value: r, label: r }))} value={form.guardian_relationship} onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })} />
            <Field label={t("phone")} value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
            <Field label={t("email")} type="email" value={form.guardian_email} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
            <Field label={t("occupation")} value={form.guardian_occupation} onChange={(e) => setForm({ ...form, guardian_occupation: e.target.value })} />
          </div>
        </div>

        {/* Address */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-sky-600" /> {t("address")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TextareaField label="Street Address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="lg:col-span-3" />
            <Field label={t("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Field label={t("state")} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <Field label={t("postal_code")} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
