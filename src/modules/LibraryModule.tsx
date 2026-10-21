import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Trash2, Search, ArrowDownToLine, ArrowUpFromLine, Barcode, Edit3, IndianRupee } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LibraryBook, BookIssue } from "@/types/db";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const FINE_PER_DAY = 5;

export function LibraryModule() {
  const [tab, setTab] = useState<"books" | "counter" | "history">("books");
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [issues, setIssues] = useState<(BookIssue & { library_books?: { title: string } | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editBook, setEditBook] = useState<LibraryBook | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanQuery, setScanQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [borrowerType, setBorrowerType] = useState<"Student" | "Staff">("Student");
  const [fineTotal, setFineTotal] = useState(0);

  const tabs = [
    { key: "books" as const, label: "Books", icon: <BookOpen size={16} /> },
    { key: "counter" as const, label: "Issue / Return", icon: <ArrowDownToLine size={16} /> },
    { key: "history" as const, label: "History", icon: <Search size={16} /> },
  ];

  const loadBooks = () => {
    setLoading(true);
    supabase.from("library_books").select("*").order("title").then(({ data, error }) => {
      if (!error) setBooks((data ?? []) as LibraryBook[]);
      setLoading(false);
    });
  };

  const loadIssues = () => {
    supabase.from("book_issues").select("*, library_books(title)").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      setIssues((data ?? []) as typeof issues);
      const fines = (data ?? []).reduce((sum, r) => sum + Number(r.late_fine || 0), 0);
      setFineTotal(fines);
    });
  };

  useEffect(() => { loadBooks(); loadIssues(); }, []);

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books;
    const q = searchQuery.toLowerCase();
    return books.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      (b.isbn ?? "").toLowerCase().includes(q) ||
      (b.barcode ?? "").toLowerCase().includes(q) ||
      (b.author ?? "").toLowerCase().includes(q),
    );
  }, [books, searchQuery]);

  const scannedBook = useMemo(() => {
    if (!scanQuery.trim()) return null;
    const q = scanQuery.toLowerCase();
    return books.find((b) => (b.isbn ?? "").toLowerCase() === q || (b.barcode ?? "").toLowerCase() === q) ?? null;
  }, [books, scanQuery]);

  const issueBook = async () => {
    if (!selectedBook || (!selectedStudent && borrowerType === "Student")) return;
    const borrowerName = selectedStudent?.full_name ?? "Staff";
    await supabase.from("book_issues").insert({
      book_id: selectedBook.id,
      student_id: selectedStudent?.id ?? null,
      borrower_name: borrowerName,
      borrower_type: borrowerType,
      isbn: selectedBook.isbn,
      barcode: selectedBook.barcode,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      status: "Issued",
      late_fine: 0,
      fine_paid: false,
    });
    await supabase.from("library_books").update({ available_copies: Math.max(0, selectedBook.available_copies - 1) }).eq("id", selectedBook.id);
    setSelectedBook(null); setScanQuery("");
    loadBooks(); loadIssues();
  };

  const returnBook = async (issue: BookIssue) => {
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(issue.due_date);
    const returned = new Date(today);
    const lateDays = Math.max(0, Math.ceil((returned.getTime() - due.getTime()) / 86400000));
    const fine = lateDays * FINE_PER_DAY;
    await supabase.from("book_issues").update({
      return_date: today,
      late_fine: fine,
      status: fine > 0 ? "Returned" : "Returned",
    }).eq("id", issue.id);
    const book = books.find((b) => b.id === issue.book_id);
    if (book) await supabase.from("library_books").update({ available_copies: book.available_copies + 1 }).eq("id", book.id);
    loadBooks(); loadIssues();
  };

  const deleteBook = async (id: string) => {
    await supabase.from("library_books").delete().eq("id", id);
    loadBooks();
  };

  const issuedNow = issues.filter((i) => i.status === "Issued");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition", tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "books" && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, ISBN, barcode…"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none" />
            </div>
            <Button onClick={() => { setEditBook(null); setAddOpen(true); }}><Plus size={14} /> Add Book</Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Title</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Author</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">ISBN</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Shelf</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Available</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr> :
                 filteredBooks.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No books found.</td></tr> :
                 filteredBooks.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.title}</td>
                    <td className="px-4 py-3 text-slate-600">{b.author ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{b.isbn ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{b.shelf_location ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-medium", b.available_copies === 0 ? "text-rose-600" : b.available_copies <= 2 ? "text-amber-600" : "text-emerald-600")}>
                        {b.available_copies}/{b.total_copies}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditBook(b); setAddOpen(true); }} className="text-slate-400 hover:text-sky-600 mr-2"><Edit3 size={15} /></button>
                      <button onClick={() => deleteBook(b.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "counter" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Issue */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ArrowDownToLine size={18} /> Issue Book</h3>
            <div className="relative">
              <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={scanQuery} onChange={(e) => setScanQuery(e.target.value)} placeholder="Scan ISBN or barcode…"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none" />
            </div>
            {scannedBook && (
              <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 px-4 py-2.5 text-sm">
                <p className="font-medium text-sky-900">{scannedBook.title}</p>
                <p className="text-xs text-slate-500">{scannedBook.author} · {scannedBook.available_copies} available</p>
              </div>
            )}
            <SelectField label="Borrower Type" value={borrowerType} onChange={(e) => setBorrowerType(e.target.value as "Student" | "Staff")}
              options={[{ value: "Student", label: "Student" }, { value: "Staff", label: "Staff" }]} />
            {borrowerType === "Student" && <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} />}
            <Field label="Due Date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Button onClick={issueBook} disabled={!scannedBook || (borrowerType === "Student" && !selectedStudent)}>
              <ArrowDownToLine size={14} /> Issue Book
            </Button>
          </div>

          {/* Return */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ArrowUpFromLine size={18} /> Return Book</h3>
            {issuedNow.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No books currently issued.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {issuedNow.map((issue) => {
                  const isOverdue = new Date(issue.due_date) < new Date();
                  return (
                    <div key={issue.id} className="flex items-center gap-3 rounded-lg ring-1 ring-slate-200 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 text-sm truncate">{issue.library_books?.title ?? "—"}</p>
                        <p className="text-xs text-slate-500">{issue.borrower_name} · Due: {formatDate(issue.due_date)}</p>
                      </div>
                      {isOverdue && <Badge tone="error">Overdue</Badge>}
                      <Button variant="secondary" onClick={() => returnBook(issue)}><ArrowUpFromLine size={14} /> Return</Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-sm">
              <IndianRupee size={14} className="text-amber-600" />
              <span className="text-slate-600">Total fines collected: </span>
              <span className="font-semibold text-amber-700">{formatCurrency(fineTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Book</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Borrower</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Issued</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Due</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Returned</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Fine</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No history yet.</td></tr> :
               issues.map((issue) => (
                <tr key={issue.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{issue.library_books?.title ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{issue.borrower_name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(issue.issue_date)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(issue.due_date)}</td>
                  <td className="px-4 py-3 text-slate-500">{issue.return_date ? formatDate(issue.return_date) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{issue.late_fine > 0 ? formatCurrency(Number(issue.late_fine)) : "—"}</td>
                  <td className="px-4 py-3"><Badge tone={issue.status === "Returned" ? "success" : issue.status === "Overdue" ? "error" : "warning"}>{issue.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BookFormModal open={addOpen} onClose={() => setAddOpen(false)} editBook={editBook}
        onSaved={() => { setAddOpen(false); loadBooks(); }} />
    </div>
  );
}

function BookFormModal({ open, onClose, editBook, onSaved }: {
  open: boolean; onClose: () => void; editBook: LibraryBook | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "", author: "", publisher: "", category: "", isbn: "", barcode: "",
    shelf_location: "", total_copies: "1", available_copies: "1", edition: "",
  });

  useEffect(() => {
    if (editBook) {
      setForm({
        title: editBook.title, author: editBook.author ?? "", publisher: editBook.publisher ?? "",
        category: editBook.category ?? "", isbn: editBook.isbn ?? "", barcode: editBook.barcode ?? "",
        shelf_location: editBook.shelf_location ?? "", total_copies: String(editBook.total_copies),
        available_copies: String(editBook.available_copies), edition: "",
      });
    } else {
      setForm({ title: "", author: "", publisher: "", category: "", isbn: "", barcode: "", shelf_location: "", total_copies: "1", available_copies: "1", edition: "" });
    }
  }, [editBook, open]);

  const save = async () => {
    const payload = {
      ...form,
      total_copies: Number(form.total_copies),
      available_copies: Number(form.available_copies),
    };
    if (editBook) {
      await supabase.from("library_books").update(payload).eq("id", editBook.id);
    } else {
      await supabase.from("library_books").insert(payload);
    }
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={editBook ? "Edit Book" : "Add Book"} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Field label="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        <Field label="ISBN" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
        <Field label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        <Field label="Publisher" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
        <Field label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <Field label="Shelf Location" value={form.shelf_location} onChange={(e) => setForm({ ...form, shelf_location: e.target.value })} />
        <Field label="Total Copies" type="number" value={form.total_copies} onChange={(e) => setForm({ ...form, total_copies: e.target.value })} />
        <Field label="Available Copies" type="number" value={form.available_copies} onChange={(e) => setForm({ ...form, available_copies: e.target.value })} />
      </div>
    </Modal>
  );
}
