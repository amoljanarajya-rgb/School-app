import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, DoorOpen, BookOpen, Package, Zap, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Room, LibraryBook, LibraryCheckout, Asset, EnergyLog, AssetCategory } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatDate, classNamesForStatus } from "@/lib/format";

type Tab = "rooms" | "library" | "assets" | "energy";

export function AnalyticsModule() {
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState<Tab>("rooms");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [checkouts, setCheckouts] = useState<(LibraryCheckout & { library_books?: { title: string } })[]>([]);
  const [assets, setAssets] = useState<(Asset & { asset_categories?: { name: string; useful_life_years: number } })[]>([]);
  const [energy, setEnergy] = useState<(EnergyLog & { rooms?: { room_no: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, b, c, a, e] = await Promise.all([
      supabase.from("rooms").select("*").order("room_no"),
      supabase.from("library_books").select("*").order("title"),
      supabase.from("library_checkouts").select("*, library_books(title)").order("checkout_date", { ascending: false }),
      supabase.from("assets").select("*, asset_categories(name, useful_life_years)").order("purchase_date", { ascending: false }),
      supabase.from("energy_logs").select("*, rooms(room_no)").order("reading_date", { ascending: false }).limit(100),
    ]);
    const firstError = [r, b, c, a, e].find((x) => x.error);
    if (firstError?.error) setError(firstError.error.message);
    else {
      setRooms((r.data ?? []) as Room[]);
      setBooks((b.data ?? []) as LibraryBook[]);
      setCheckouts((c.data ?? []) as typeof checkouts);
      setAssets((a.data ?? []) as typeof assets);
      setEnergy((e.data ?? []) as typeof energy);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const occupied = rooms.filter((r) => r.is_occupied).length;
    const totalCapacity = rooms.reduce((s, r) => s + r.capacity, 0);
    const usedCapacity = rooms.reduce((s, r) => s + r.current_usage, 0);
    const utilization = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
    const issued = checkouts.filter((c) => c.status === "Issued" || c.status === "Overdue").length;
    const overdue = checkouts.filter((c) => c.status === "Overdue").length;
    const assetValue = assets.reduce((s, a) => s + Number(a.current_value ?? a.purchase_cost), 0);
    const totalDepreciation = assets.reduce((s, a) => s + (Number(a.purchase_cost) - Number(a.current_value ?? a.purchase_cost)), 0);
    const totalKwh = energy.reduce((s, e) => s + Number(e.consumption_kwh), 0);
    const totalEnergyCost = energy.reduce((s, e) => s + Number(e.cost), 0);
    return { occupied, utilization, issued, overdue, assetValue, totalDepreciation, totalKwh, totalEnergyCost };
  }, [rooms, checkouts, assets, energy]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Campus Analytics</h2>
        <p className="text-slate-500 mt-1">Room utilization, library, asset depreciation, and energy consumption.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Room Utilization" value={`${stats.utilization}%`} hint={`${stats.occupied} of ${rooms.length} rooms occupied`} tone="info" icon={<DoorOpen size={20} />} />
        <StatCard label="Books Checked Out" value={stats.issued} hint={`${stats.overdue} overdue`} tone="warning" icon={<BookOpen size={20} />} />
        <StatCard label="Asset Value" value={formatCurrency(stats.assetValue)} hint={`Depreciated ${formatCurrency(stats.totalDepreciation)}`} tone="success" icon={<Package size={20} />} />
        <StatCard label="Energy Usage" value={`${stats.totalKwh.toFixed(0)} kWh`} hint={`Cost ${formatCurrency(stats.totalEnergyCost)}`} tone="warning" icon={<Zap size={20} />} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["rooms", "Rooms"], ["library", "Library"], ["assets", "Assets"], ["energy", "Energy"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm">{error}</div>
      ) : tab === "rooms" ? (
        <RoomsPanel rooms={rooms} onChanged={load} />
      ) : tab === "library" ? (
        <LibraryPanel books={books} checkouts={checkouts} lookups={lookups} onChanged={load} />
      ) : tab === "assets" ? (
        <AssetsPanel assets={assets} lookups={lookups} onChanged={load} />
      ) : (
        <EnergyPanel energy={energy} rooms={rooms} onChanged={load} />
      )}
    </div>
  );
}

function RoomsPanel({ rooms, onChanged }: { rooms: Room[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    room_no: "", room_type: "Classroom" as Room["room_type"], floor: "1",
    capacity: "40", current_usage: "0", is_occupied: false,
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.room_no.trim()) throw new Error("Room number is required.");
      const { error } = await supabase.from("rooms").insert({
        room_no: form.room_no.trim(),
        room_type: form.room_type,
        floor: Number(form.floor),
        capacity: Number(form.capacity),
        current_usage: Number(form.current_usage),
        is_occupied: form.is_occupied,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ room_no: "", room_type: "Classroom", floor: "1", capacity: "40", current_usage: "0", is_occupied: false });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this room?")) return;
    await supabase.from("rooms").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Room Utilization</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Room</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Room No</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Floor</th>
              <th className="text-left font-medium px-4 py-3">Capacity</th>
              <th className="text-left font-medium px-4 py-3">In Use</th>
              <th className="text-left font-medium px-4 py-3">Utilization</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => {
              const pct = r.capacity > 0 ? Math.round((r.current_usage / r.capacity) * 100) : 0;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.room_no}</td>
                  <td className="px-4 py-3"><Badge tone="info">{r.room_type}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">Floor {r.floor}</td>
                  <td className="px-4 py-3 text-slate-700">{r.capacity}</td>
                  <td className="px-4 py-3 text-slate-700">{r.current_usage}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={r.is_occupied ? "success" : "neutral"}>{r.is_occupied ? "Occupied" : "Free"}</Badge></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Room" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Number" required value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} />
            <SelectField label="Room Type" options={["Classroom", "Lab", "Library", "Office", "Staff Room", "Store", "Other"].map((t) => ({ value: t, label: t }))} value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value as Room["room_type"] })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Floor" type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            <Field label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            <Field label="In Use" type="number" value={form.current_usage} onChange={(e) => setForm({ ...form, current_usage: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.is_occupied} onChange={(e) => setForm({ ...form, is_occupied: e.target.checked })} className="rounded" />
            Currently occupied
          </label>
        </div>
      </Modal>
    </div>
  );
}

function LibraryPanel({ books, checkouts, lookups, onChanged }: { books: LibraryBook[]; checkouts: (LibraryCheckout & { library_books?: { title: string } })[]; lookups: ReturnType<typeof useLookups>["data"]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ isbn: "", title: "", author: "", publisher: "", category: "", total_copies: "1", shelf_location: "" });
  const [checkoutForm, setCheckoutForm] = useState({
    book_id: "", student_id: "", borrower_name: "",
    checkout_date: new Date().toISOString().slice(0, 10), due_date: "", status: "Issued" as LibraryCheckout["status"],
  });

  const saveBook = async () => {
    setSaving(true);
    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      const copies = Number(form.total_copies) || 1;
      const { error } = await supabase.from("library_books").insert({
        isbn: form.isbn || null, title: form.title, author: form.author || null,
        publisher: form.publisher || null, category: form.category || null,
        total_copies: copies, available_copies: copies, shelf_location: form.shelf_location || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ isbn: "", title: "", author: "", publisher: "", category: "", total_copies: "1", shelf_location: "" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const saveCheckout = async () => {
    setSaving(true);
    try {
      if (!checkoutForm.book_id || !checkoutForm.borrower_name || !checkoutForm.due_date) {
        throw new Error("Book, borrower name and due date are required.");
      }
      const { error } = await supabase.from("library_checkouts").insert({
        book_id: checkoutForm.book_id,
        student_id: checkoutForm.student_id || null,
        borrower_name: checkoutForm.borrower_name,
        checkout_date: checkoutForm.checkout_date,
        due_date: checkoutForm.due_date,
        status: checkoutForm.status,
      });
      if (error) throw error;
      setCheckoutOpen(false);
      setCheckoutForm({ book_id: "", student_id: "", borrower_name: "", checkout_date: new Date().toISOString().slice(0, 10), due_date: "", status: "Issued" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const returnBook = async (id: string) => {
    const { error } = await supabase.from("library_checkouts").update({ return_date: new Date().toISOString().slice(0, 10), status: "Returned" }).eq("id", id);
    if (error) alert(error.message);
    onChanged();
  };

  const removeBook = async (id: string) => {
    if (!confirm("Delete this book?")) return;
    await supabase.from("library_books").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Book Catalog</h3>
          <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Book</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Title</th>
                <th className="text-left font-medium px-4 py-3">Author</th>
                <th className="text-left font-medium px-4 py-3">Category</th>
                <th className="text-left font-medium px-4 py-3">Available</th>
                <th className="text-left font-medium px-4 py-3">Shelf</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {books.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{b.title}</p>
                    <p className="text-xs text-slate-500">{b.isbn ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{b.author ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{b.category ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={b.available_copies > 0 ? "success" : "error"}>{b.available_copies} / {b.total_copies}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.shelf_location ?? "—"}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => removeBook(b.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Checkouts</h3>
          <Button onClick={() => setCheckoutOpen(true)}><Plus size={16} /> Issue Book</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Book</th>
                <th className="text-left font-medium px-4 py-3">Borrower</th>
                <th className="text-left font-medium px-4 py-3">Checkout</th>
                <th className="text-left font-medium px-4 py-3">Due</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Fine</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checkouts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.library_books?.title ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{c.borrower_name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.checkout_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.due_date)}</td>
                  <td className="px-4 py-3"><Badge tone={classNamesForStatus(c.status)}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(c.fine)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== "Returned" && <button onClick={() => returnBook(c.id)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Return</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Book" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={saveBook} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <Field label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="ISBN" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            <Field label="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            <Field label="Publisher" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
            <Field label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Field label="Total Copies" type="number" value={form.total_copies} onChange={(e) => setForm({ ...form, total_copies: e.target.value })} />
            <Field label="Shelf Location" value={form.shelf_location} onChange={(e) => setForm({ ...form, shelf_location: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Issue Book" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCheckoutOpen(false)}>Cancel</Button><Button onClick={saveCheckout} disabled={saving}>{saving ? "Saving…" : "Issue"}</Button></div>}>
        <div className="space-y-4">
          <SelectField label="Book" required placeholder="Select book" options={books.filter((b) => b.available_copies > 0).map((b) => ({ value: b.id, label: b.title }))} value={checkoutForm.book_id} onChange={(e) => setCheckoutForm({ ...checkoutForm, book_id: e.target.value })} />
          <Field label="Borrower Name" required value={checkoutForm.borrower_name} onChange={(e) => setCheckoutForm({ ...checkoutForm, borrower_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Checkout Date" type="date" value={checkoutForm.checkout_date} onChange={(e) => setCheckoutForm({ ...checkoutForm, checkout_date: e.target.value })} />
            <Field label="Due Date" required type="date" value={checkoutForm.due_date} onChange={(e) => setCheckoutForm({ ...checkoutForm, due_date: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AssetsPanel({ assets, lookups, onChanged }: { assets: (Asset & { asset_categories?: { name: string; useful_life_years: number } })[]; lookups: ReturnType<typeof useLookups>["data"]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_code: "", name: "", category_id: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: "", salvage_value: "0", current_value: "", location: "", status: "In Use" as Asset["status"],
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.asset_code.trim() || !form.name.trim() || !form.purchase_cost) {
        throw new Error("Asset code, name and purchase cost are required.");
      }
      const { error } = await supabase.from("assets").insert({
        asset_code: form.asset_code.trim(),
        name: form.name.trim(),
        category_id: form.category_id || null,
        purchase_date: form.purchase_date,
        purchase_cost: Number(form.purchase_cost),
        salvage_value: Number(form.salvage_value) || 0,
        current_value: form.current_value ? Number(form.current_value) : Number(form.purchase_cost),
        location: form.location || null,
        status: form.status,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ asset_code: "", name: "", category_id: "", purchase_date: new Date().toISOString().slice(0, 10), purchase_cost: "", salvage_value: "0", current_value: "", location: "", status: "In Use" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    await supabase.from("assets").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Asset Register & Depreciation</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Asset</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Code</th>
              <th className="text-left font-medium px-4 py-3">Name</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-left font-medium px-4 py-3">Purchased</th>
              <th className="text-left font-medium px-4 py-3">Cost</th>
              <th className="text-left font-medium px-4 py-3">Current Value</th>
              <th className="text-left font-medium px-4 py-3">Depreciation</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((a) => {
              const depreciation = Number(a.purchase_cost) - Number(a.current_value ?? a.purchase_cost);
              const depPct = a.purchase_cost > 0 ? Math.round((depreciation / Number(a.purchase_cost)) * 100) : 0;
              return (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{a.asset_code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.location ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{a.asset_categories?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(a.purchase_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(a.purchase_cost)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(a.current_value)}</td>
                  <td className="px-4 py-3">
                    <span className="text-rose-600">{formatCurrency(depreciation)}</span>
                    <span className="text-xs text-slate-400 ml-1">({depPct}%)</span>
                  </td>
                  <td className="px-4 py-3"><Badge tone={classNamesForStatus(a.status)}>{a.status}</Badge></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(a.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Asset" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Asset Code" required value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} />
          <Field label="Asset Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <SelectField label="Category" placeholder="Select category" options={(lookups?.assetCategories ?? []).map((c) => ({ value: c.id, label: c.name }))} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} />
          <Field label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Field label="Purchase Date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
          <Field label="Purchase Cost" required type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} />
          <Field label="Salvage Value" type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} />
          <Field label="Current Value" type="number" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} hint="Defaults to purchase cost" />
          <SelectField label="Status" options={["In Use", "Under Maintenance", "Disposed", "Lost"].map((s) => ({ value: s, label: s }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Asset["status"] })} />
        </div>
      </Modal>
    </div>
  );
}

function EnergyPanel({ energy, rooms, onChanged }: { energy: (EnergyLog & { rooms?: { room_no: string } })[]; rooms: Room[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    reading_date: new Date().toISOString().slice(0, 10), room_id: "",
    consumption_kwh: "", cost: "", source: "Grid" as EnergyLog["source"],
  });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.consumption_kwh || !form.cost) throw new Error("Consumption and cost are required.");
      const { error } = await supabase.from("energy_logs").insert({
        reading_date: form.reading_date,
        room_id: form.room_id || null,
        consumption_kwh: Number(form.consumption_kwh),
        cost: Number(form.cost),
        source: form.source,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ reading_date: new Date().toISOString().slice(0, 10), room_id: "", consumption_kwh: "", cost: "", source: "Grid" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this energy log?")) return;
    await supabase.from("energy_logs").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Energy Consumption Tracking</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Log Reading</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Room</th>
              <th className="text-left font-medium px-4 py-3">Consumption</th>
              <th className="text-left font-medium px-4 py-3">Cost</th>
              <th className="text-left font-medium px-4 py-3">Source</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {energy.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{formatDate(e.reading_date)}</td>
                <td className="px-4 py-3 text-slate-700">{e.rooms?.room_no ?? "Campus"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{Number(e.consumption_kwh).toFixed(1)} kWh</td>
                <td className="px-4 py-3 text-slate-700">{formatCurrency(e.cost)}</td>
                <td className="px-4 py-3"><Badge tone={e.source === "Solar" ? "success" : "info"}>{e.source ?? "—"}</Badge></td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Log Energy Reading" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>}>
        <div className="space-y-4">
          <Field label="Reading Date" type="date" value={form.reading_date} onChange={(e) => setForm({ ...form, reading_date: e.target.value })} />
          <SelectField label="Room" placeholder="Optional - campus wide" options={rooms.map((r) => ({ value: r.id, label: r.room_no }))} value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Consumption (kWh)" required type="number" value={form.consumption_kwh} onChange={(e) => setForm({ ...form, consumption_kwh: e.target.value })} />
            <Field label="Cost" required type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <SelectField label="Source" options={["Grid", "Solar", "Generator", "Other"].map((s) => ({ value: s, label: s }))} value={form.source ?? "Grid"} onChange={(e) => setForm({ ...form, source: e.target.value as EnergyLog["source"] })} />
        </div>
      </Modal>
    </div>
  );
}
