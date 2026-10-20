import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, Trash2, Receipt, Printer, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FeeStructure, FeeCollection, IncomeEntry, ExpenseEntry, FeeCategory } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StatCard } from "@/components/StatCard";
import { FileUpload } from "@/components/FileUpload";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { ReceiptPrint, type ReceiptData } from "@/components/ReceiptPrint";
import { formatCurrency, formatDate } from "@/lib/format";

type Tab = "collections" | "structures" | "income" | "expenses";

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "NetBanking", "Bank Transfer", "Cheque", "Online"];

export function FinanceModule() {
  const { data: lookups } = useLookups();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("collections");
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [collections, setCollections] = useState<(FeeCollection & { students?: { full_name: string; admission_no: string } })[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, c, i, e] = await Promise.all([
      supabase.from("fee_structures").select("*").order("academic_year", { ascending: false }),
      supabase.from("fee_collections").select("*, students(full_name, admission_no)").order("payment_date", { ascending: false }),
      supabase.from("income_entries").select("*").order("entry_date", { ascending: false }),
      supabase.from("expense_entries").select("*").order("entry_date", { ascending: false }),
    ]);
    const firstError = [s, c, i, e].find((r) => r.error);
    if (firstError?.error) setError(firstError.error.message);
    else {
      setStructures((s.data ?? []) as FeeStructure[]);
      setCollections((c.data ?? []) as typeof collections);
      setIncomes((i.data ?? []) as IncomeEntry[]);
      setExpenses((e.data ?? []) as ExpenseEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const collected = collections.reduce((s, r) => s + Number(r.amount), 0);
    const income = incomes.reduce((s, r) => s + Number(r.amount), 0);
    const expense = expenses.reduce((s, r) => s + Number(r.amount), 0);
    const annualStructured = structures.reduce((s, r) => s + Number(r.amount), 0);
    return { collected, income, expense, net: income - expense, annualStructured };
  }, [collections, incomes, expenses, structures]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Finance & Fees</h2>
        <p className="text-slate-500 mt-1">Fee structures, collections with receipt printing, daily income, and expenses.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Fees Collected" value={formatCurrency(totals.collected)} tone="success" icon={<Wallet size={20} />} />
        <StatCard label="Annual Fee Structure" value={formatCurrency(totals.annualStructured)} tone="info" icon={<Receipt size={20} />} />
        <StatCard label="Total Income" value={formatCurrency(totals.income)} tone="success" icon={<TrendingUp size={20} />} />
        <StatCard label="Total Expenses" value={formatCurrency(totals.expense)} tone="error" icon={<TrendingDown size={20} />} hint={`Net ${formatCurrency(totals.net)}`} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["collections", "Fee Collections"], ["structures", "Fee Structures"], ["income", "Income"], ["expenses", "Expenses"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm">{error}</div>
      ) : tab === "collections" ? (
        <CollectionsPanel collections={collections} lookups={lookups} onChanged={load} />
      ) : tab === "structures" ? (
        <StructuresPanel structures={structures} lookups={lookups} onChanged={load} />
      ) : tab === "income" ? (
        <IncomePanel incomes={incomes} onChanged={load} />
      ) : (
        <ExpensesPanel expenses={expenses} onChanged={load} />
      )}
    </div>
  );
}

// ============ Fee Collections with breakdown + receipt ============

type FeeBreakdownItem = { category_id: string; label: string; amount: number };

function CollectionsPanel({
  collections,
  lookups,
  onChanged,
}: {
  collections: (FeeCollection & { students?: { full_name: string; admission_no: string } })[];
  lookups: ReturnType<typeof useLookups>["data"];
  onChanged: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [breakdown, setBreakdown] = useState<FeeBreakdownItem[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [receiptNo, setReceiptNo] = useState("");
  const [remarks, setRemarks] = useState("");

  // Fee structures applicable to the selected student's class
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  const [applicableFees, setApplicableFees] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!selectedStudent) {
      setStudentClassId(null);
      setApplicableFees([]);
      setBreakdown([]);
      return;
    }
    supabase
      .from("students")
      .select("class_id")
      .eq("id", selectedStudent.id)
      .single()
      .then(({ data }) => {
        const cid = (data as { class_id: string } | null)?.class_id ?? null;
        setStudentClassId(cid);
        if (cid) {
          supabase.from("fee_structures").select("*").eq("class_id", cid).eq("academic_year", "2026-2027").then(({ data: fs }) => {
            const structures = (fs ?? []) as FeeStructure[];
            setApplicableFees(structures);
            // Pre-fill breakdown with all applicable fees
            setBreakdown(
              structures.map((s) => ({
                category_id: s.category_id,
                label: String(lookups?.feeCategories.find((c) => c.id === s.category_id)?.name ?? "Fee"),
                amount: Number(s.amount),
              })),
            );
          });
        }
      });
  }, [selectedStudent, lookups]);

  const breakdownTotal = breakdown.reduce((s, r) => s + r.amount, 0);

  const addBreakdownRow = () => {
    setBreakdown([...breakdown, { category_id: "", label: "", amount: 0 }]);
  };

  const updateBreakdownRow = (index: number, field: keyof FeeBreakdownItem, value: string | number) => {
    setBreakdown(breakdown.map((row, i) => {
      if (i !== index) return row;
      if (field === "category_id") {
        const cat = lookups?.feeCategories.find((c) => c.id === (value as string));
        const matched = applicableFees.find((f) => f.category_id === value);
        return {
          category_id: value as string,
          label: String(cat?.name ?? ""),
          amount: matched ? Number(matched.amount) : row.amount,
        };
      }
      if (field === "amount") return { ...row, amount: Number(value) || 0 };
      if (field === "label") return { ...row, label: String(value) };
      return row;
    }));
  };

  const removeBreakdownRow = (index: number) => {
    setBreakdown(breakdown.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSelectedStudent(null);
    setBreakdown([]);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("Cash");
    setReceiptNo("");
    setRemarks("");
    setFormError(null);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!selectedStudent) throw new Error("Please select a student.");
      if (breakdown.length === 0 || breakdownTotal <= 0) throw new Error("Add at least one fee item with a positive amount.");

      const generatedReceipt = receiptNo || `RCP-${Date.now().toString().slice(-6)}`;
      // Insert one collection per breakdown row
      const inserts = breakdown
        .filter((r) => r.amount > 0)
        .map((r) => ({
          student_id: selectedStudent.id,
          category_id: r.category_id || null,
          amount: r.amount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          receipt_no: `${generatedReceipt}-${breakdown.indexOf(r) + 1}`,
          remarks: remarks || null,
        }));

      const { error } = await supabase.from("fee_collections").insert(inserts);
      if (error) throw error;

      // Fetch class name for receipt
      let className: string | undefined;
      if (studentClassId) {
        className = lookups?.classes.find((c) => c.id === studentClassId)?.name;
      }

      setReceiptData({
        receipt_no: generatedReceipt,
        student_name: selectedStudent.full_name,
        admission_no: selectedStudent.admission_no,
        class_name: className,
        items: breakdown.filter((r) => r.amount > 0).map((r) => ({ label: r.label || "Fee", amount: r.amount })),
        payment_method: paymentMethod,
        payment_date: paymentDate,
        total: breakdownTotal,
        remarks: remarks || null,
      });
      setOpen(false);
      resetForm();
      setReceiptOpen(true);
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this collection entry?")) return;
    await supabase.from("fee_collections").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Fee Collections</h3>
        <Button onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} /> Record Payment</Button>
      </div>
      <div className="overflow-x-auto">
        {collections.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No fee collections recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Receipt</th>
                <th className="text-left font-medium px-4 py-3">Student</th>
                <th className="text-left font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {collections.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.receipt_no ?? "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{c.students?.full_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{c.students?.admission_no ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(c.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.payment_date)}</td>
                  <td className="px-4 py-3"><Badge tone="info">{c.payment_method ?? "—"}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(c.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Collection Entry Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Fee Collection Entry"
        description="Search for a student, review the fee breakdown, and record the payment."
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Record & Generate Receipt"}</Button>
          </div>
        }
      >
        {formError && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{formError}</div>}

        <div className="space-y-5">
          {/* Student search */}
          <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} label={t("student_search") ? "Student" : "Student"} />

          {/* Fee breakdown table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-slate-900 text-sm">{t("fee_breakdown")}</h4>
              <button onClick={addBreakdownRow} className="text-sm text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add item</button>
            </div>
            {breakdown.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                {selectedStudent ? "No fee structures found for this class. Add items manually." : "Select a student to load applicable fees."}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Fee Category</th>
                      <th className="text-left font-medium px-3 py-2 w-40">Amount (₹)</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {breakdown.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <select
                            value={row.category_id}
                            onChange={(e) => updateBreakdownRow(i, "category_id", e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                          >
                            <option value="">Custom / Other</option>
                            {(lookups?.feeCategories ?? []).map((c: FeeCategory) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={row.amount || ""}
                            onChange={(e) => updateBreakdownRow(i, "amount", e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeBreakdownRow(i)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2 text-right text-slate-700">Total</td>
                      <td className="px-3 py-2 tabular-nums text-slate-900">{formatCurrency(breakdownTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Payment details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label={t("payment_mode")} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            <Field label={t("receipt_no")} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} hint="Auto-generated if left blank" />
            <Field label="Payment Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <TextareaField label={t("remarks")} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </Modal>

      {/* Receipt modal */}
      <Modal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        title="Fee Receipt"
        size="md"
      >
        {receiptData && <ReceiptPrint data={receiptData} onDone={() => setReceiptOpen(false)} />}
      </Modal>
    </div>
  );
}

// ============ Fee Structures ============

function StructuresPanel({
  structures,
  lookups,
  onChanged,
}: {
  structures: FeeStructure[];
  lookups: ReturnType<typeof useLookups>["data"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ class_id: "", category_id: "", academic_year: "2026-2027", amount: "", due_date: "" });

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!form.class_id || !form.category_id || !form.academic_year || !form.amount) throw new Error("Class, category, academic year and amount are required.");
      const { error } = await supabase.from("fee_structures").insert({
        class_id: form.class_id, category_id: form.category_id, academic_year: form.academic_year,
        amount: Number(form.amount), due_date: form.due_date || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ class_id: "", category_id: "", academic_year: "2026-2027", amount: "", due_date: "" });
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this fee structure?")) return;
    await supabase.from("fee_structures").delete().eq("id", id);
    onChanged();
  };

  const className = (id: string) => lookups?.classes.find((c) => c.id === id)?.name ?? "—";
  const catName = (id: string) => lookups?.feeCategories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Annual Fee Structures</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Structure</Button>
      </div>
      <div className="overflow-x-auto">
        {structures.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No fee structures defined.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Class</th>
                <th className="text-left font-medium px-4 py-3">Category</th>
                <th className="text-left font-medium px-4 py-3">Year</th>
                <th className="text-left font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Due Date</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {structures.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{className(s.class_id)}</td>
                  <td className="px-4 py-3"><Badge tone="info">{catName(s.category_id)}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{s.academic_year}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(s.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(s.due_date)}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(s.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Fee Structure" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        {formError && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="space-y-4">
          <SelectField label="Class" required placeholder="Select class" options={(lookups?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))} value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} />
          <SelectField label="Fee Category" required placeholder="Select category" options={(lookups?.feeCategories ?? []).map((c) => ({ value: c.id, label: c.name }))} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic Year" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
            <Field label="Amount" required type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <Field label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ============ Income with voucher upload ============

function IncomePanel({ incomes, onChanged }: { incomes: IncomeEntry[]; onChanged: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    source: "", amount: "", entry_date: new Date().toISOString().slice(0, 10),
    description: "", payment_method: "Cash", voucher_url: "" as string | null,
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.source || !form.amount) throw new Error("Source and amount are required.");
      const { error } = await supabase.from("income_entries").insert({
        source: form.source, amount: Number(form.amount), entry_date: form.entry_date,
        description: form.description || null, payment_method: form.payment_method,
        voucher_url: form.voucher_url || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ source: "", amount: "", entry_date: new Date().toISOString().slice(0, 10), description: "", payment_method: "Cash", voucher_url: null });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this income entry?")) return;
    await supabase.from("income_entries").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Daily Income</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Income</Button>
      </div>
      <div className="overflow-x-auto">
        {incomes.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No income entries.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-left font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-left font-medium px-4 py-3">Voucher</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incomes.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{i.source}</p><p className="text-xs text-slate-500 truncate max-w-xs">{i.description ?? ""}</p></td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(i.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(i.entry_date)}</td>
                  <td className="px-4 py-3"><Badge tone="info">{i.payment_method ?? "—"}</Badge></td>
                  <td className="px-4 py-3">{i.voucher_url ? <a href={i.voucher_url.startsWith("http") ? i.voucher_url : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/erp-uploads/${i.voucher_url}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">View</a> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(i.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Income Entry" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <Field label={t("source")} required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Donations, Fundraiser" />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("amount")} required type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Field label="Date" type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          </div>
          <SelectField label="Payment Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
          <TextareaField label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <FileUpload folder="vouchers/income" value={form.voucher_url} onChange={(p) => setForm({ ...form, voucher_url: p })} label={t("payment_voucher")} hint="PDF or image, up to 5 MB" variant="file" accept="image/*,application/pdf" />
        </div>
      </Modal>
    </div>
  );
}

// ============ Expenses with voucher upload ============

function ExpensesPanel({ expenses, onChanged }: { expenses: ExpenseEntry[]; onChanged: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "", amount: "", entry_date: new Date().toISOString().slice(0, 10),
    description: "", payment_method: "Cash", voucher_url: "" as string | null,
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.category || !form.amount) throw new Error("Category and amount are required.");
      const { error } = await supabase.from("expense_entries").insert({
        category: form.category, amount: Number(form.amount), entry_date: form.entry_date,
        description: form.description || null, payment_method: form.payment_method,
        voucher_url: form.voucher_url || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ category: "", amount: "", entry_date: new Date().toISOString().slice(0, 10), description: "", payment_method: "Cash", voucher_url: null });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense entry?")) return;
    await supabase.from("expense_entries").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Daily Expenses</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Expense</Button>
      </div>
      <div className="overflow-x-auto">
        {expenses.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No expense entries.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Category</th>
                <th className="text-left font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-left font-medium px-4 py-3">Voucher</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{e.category}</p><p className="text-xs text-slate-500 truncate max-w-xs">{e.description ?? ""}</p></td>
                  <td className="px-4 py-3 font-semibold text-rose-600">{formatCurrency(e.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.entry_date)}</td>
                  <td className="px-4 py-3"><Badge tone="info">{e.payment_method ?? "—"}</Badge></td>
                  <td className="px-4 py-3">{e.voucher_url ? <a href={e.voucher_url.startsWith("http") ? e.voucher_url : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/erp-uploads/${e.voucher_url}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">View</a> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Expense Entry" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <Field label={t("category")} required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Salary, Maintenance, Utility" />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("amount")} required type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Field label="Date" type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          </div>
          <SelectField label="Payment Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
          <TextareaField label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <FileUpload folder="vouchers/expenses" value={form.voucher_url} onChange={(p) => setForm({ ...form, voucher_url: p })} label={t("payment_voucher")} hint="PDF or image, up to 5 MB" variant="file" accept="image/*,application/pdf" />
        </div>
      </Modal>
    </div>
  );
}
