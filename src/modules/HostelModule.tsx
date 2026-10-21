import { useEffect, useMemo, useState } from "react";
import { BedDouble, Plus, Trash2, DoorOpen, LogOut, LogIn, KeyRound, ShieldCheck, UserPlus, Home, IndianRupee } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { HostelRoom, HostelAllocation, HostelFee, GatePass } from "@/types/db";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export function HostelModule() {
  const [tab, setTab] = useState<"rooms" | "allocations" | "gatepass">("rooms");
  const [rooms, setRooms] = useState<HostelRoom[]>([]);
  const [allocations, setAllocations] = useState<(HostelAllocation & { students?: { full_name: string; admission_no: string } | null; hostel_rooms?: { room_no: string; block_name: string } | null })[]>([]);
  const [gatePasses, setGatePasses] = useState<(GatePass & { students?: { full_name: string; admission_no: string } | null })[]>([]);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [allocStudent, setAllocStudent] = useState<StudentSearchResult | null>(null);
  const [allocRoom, setAllocRoom] = useState("");
  const [feeStudent, setFeeStudent] = useState<StudentSearchResult | null>(null);
  const [feeAmount, setFeeAmount] = useState("5000");
  const [feeMonth, setFeeMonth] = useState(String(new Date().getMonth() + 1));
  const [feeYear, setFeeYear] = useState(String(new Date().getFullYear()));
  const [feeReceipt, setFeeReceipt] = useState("");
  const [feePaymentMethod, setFeePaymentMethod] = useState("Cash");
  const [passStudent, setPassStudent] = useState<StudentSearchResult | null>(null);
  const [passForm, setPassForm] = useState({ pass_type: "Exit", out_date: new Date().toISOString().slice(0, 16), expected_return: "", reason: "", destination: "", contact_person: "", contact_phone: "" });

  const tabs = [
    { key: "rooms" as const, label: "Rooms", icon: <Home size={16} /> },
    { key: "allocations" as const, label: "Allocations", icon: <BedDouble size={16} /> },
    { key: "gatepass" as const, label: "Gate Pass", icon: <ShieldCheck size={16} /> },
  ];

  const loadRooms = () => { supabase.from("hostel_rooms").select("*").order("block_name").order("room_no").then(({ data }) => setRooms((data ?? []) as HostelRoom[])); };
  const loadAllocations = () => {
    supabase.from("hostel_allocations").select("*, students(full_name, admission_no), hostel_rooms(room_no, block_name)").eq("status", "Active").order("allocation_date", { ascending: false }).then(({ data }) => setAllocations((data ?? []) as typeof allocations));
  };
  const loadPasses = () => {
    supabase.from("gate_passes").select("*, students(full_name, admission_no)").order("created_at", { ascending: false }).limit(20).then(({ data }) => setGatePasses((data ?? []) as typeof gatePasses));
  };

  useEffect(() => { loadRooms(); loadAllocations(); loadPasses(); }, []);

  const roomStats = useMemo(() => {
    const total = rooms.length;
    const available = rooms.filter((r) => r.status === "Available").length;
    const full = rooms.filter((r) => r.status === "Full").length;
    const maintenance = rooms.filter((r) => r.status === "Maintenance").length;
    const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
    const occupancy = rooms.reduce((s, r) => s + r.current_occupancy, 0);
    return { total, available, full, maintenance, capacity, occupancy };
  }, [rooms]);

  const allocateRoom = async () => {
    if (!allocStudent || !allocRoom) return;
    const room = rooms.find((r) => r.id === allocRoom);
    if (!room || room.current_occupancy >= room.capacity) return;
    await supabase.from("hostel_allocations").insert({ student_id: allocStudent.id, room_id: allocRoom, status: "Active", mess_included: true });
    const newStatus = room.current_occupancy + 1 >= room.capacity ? "Full" : "Available";
    await supabase.from("hostel_rooms").update({ current_occupancy: room.current_occupancy + 1, status: newStatus }).eq("id", room.id);
    setAllocOpen(false); setAllocStudent(null); setAllocRoom("");
    loadRooms(); loadAllocations();
  };

  const vacateRoom = async (alloc: typeof allocations[number]) => {
    await supabase.from("hostel_allocations").update({ vacate_date: new Date().toISOString().slice(0, 10), status: "Vacated" }).eq("id", alloc.id);
    const room = rooms.find((r) => r.id === alloc.room_id);
    if (room) await supabase.from("hostel_rooms").update({ current_occupancy: Math.max(0, room.current_occupancy - 1), status: "Available" }).eq("id", room.id);
    loadRooms(); loadAllocations();
  };

  const collectFee = async () => {
    if (!feeStudent) return;
    await supabase.from("hostel_fees").insert({
      student_id: feeStudent.id, amount: Number(feeAmount),
      period_month: Number(feeMonth), period_year: Number(feeYear),
      payment_method: feePaymentMethod, receipt_no: feeReceipt || null, status: "Paid",
    });
    setFeeOpen(false); setFeeStudent(null); setFeeReceipt("");
    alert(`Hostel fee collected from ${feeStudent.full_name}`);
  };

  const createPass = async () => {
    if (!passStudent) return;
    await supabase.from("gate_passes").insert({
      student_id: passStudent.id, pass_type: passForm.pass_type as GatePass["pass_type"],
      out_date: passForm.out_date, expected_return: passForm.expected_return || null,
      reason: passForm.reason, destination: passForm.destination || null,
      contact_person: passForm.contact_person || null, contact_phone: passForm.contact_phone || null,
      status: "Pending",
    });
    setPassOpen(false); setPassStudent(null);
    setPassForm({ pass_type: "Exit", out_date: new Date().toISOString().slice(0, 16), expected_return: "", reason: "", destination: "", contact_person: "", contact_phone: "" });
    loadPasses();
  };

  const updatePassStatus = async (pass: GatePass, status: GatePass["status"]) => {
    const update: Record<string, unknown> = { status };
    if (status === "Completed") update.actual_return = new Date().toISOString();
    if (status === "Approved" || status === "Rejected") update.approved_by = "Admin";
    await supabase.from("gate_passes").update(update).eq("id", pass.id);
    loadPasses();
  };

  const deleteRoom = async (id: string) => { await supabase.from("hostel_rooms").delete().eq("id", id); loadRooms(); };

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

      {tab === "rooms" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: "Total Rooms", value: roomStats.total, tone: "info" },
              { label: "Available", value: roomStats.available, tone: "success" },
              { label: "Full", value: roomStats.full, tone: "error" },
              { label: "Maintenance", value: roomStats.maintenance, tone: "warning" },
              { label: "Capacity", value: roomStats.capacity, tone: "neutral" },
              { label: "Occupancy", value: roomStats.occupancy, tone: "info" },
            ].map((s, i) => (
              <div key={i} className={cn("rounded-xl ring-1 px-3 py-2.5 text-center",
                s.tone === "success" ? "bg-emerald-50 ring-emerald-200 text-emerald-700" : s.tone === "error" ? "bg-rose-50 ring-rose-200 text-rose-700"
                : s.tone === "warning" ? "bg-amber-50 ring-amber-200 text-amber-700" : s.tone === "info" ? "bg-sky-50 ring-sky-200 text-sky-700" : "bg-slate-50 ring-slate-200 text-slate-700")}>
                <p className="text-xl font-bold">{s.value}</p><p className="text-xs opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Hostel Rooms</h3>
            <Button onClick={() => setAddRoomOpen(true)}><Plus size={14} /> Add Room</Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Room No</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Block</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Floor</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Type</th>
                <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Occupancy</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Fee</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No rooms yet.</td></tr> :
                 rooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.room_no}</td>
                    <td className="px-4 py-3 text-slate-600">{r.block_name}</td>
                    <td className="px-4 py-3 text-slate-600">Floor {r.floor}</td>
                    <td className="px-4 py-3"><Badge tone="neutral">{r.room_type}</Badge></td>
                    <td className="px-4 py-3 text-center text-slate-700">{r.current_occupancy}/{r.capacity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.monthly_fee)}</td>
                    <td className="px-4 py-3"><Badge tone={r.status === "Available" ? "success" : r.status === "Full" ? "error" : "warning"}>{r.status}</Badge></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => deleteRoom(r.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "allocations" && (
        <>
          <div className="flex items-center gap-3">
            <Button onClick={() => setAllocOpen(true)}><UserPlus size={14} /> Allocate Room</Button>
            <Button variant="secondary" onClick={() => setFeeOpen(true)}><IndianRupee size={14} /> Collect Fee</Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Active Allocations</h3></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Student</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Admission No</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Room</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Block</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Allocated</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Mess</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No active allocations.</td></tr> :
                 allocations.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{a.students?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.students?.admission_no ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{a.hostel_rooms?.room_no ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.hostel_rooms?.block_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(a.allocation_date)}</td>
                    <td className="px-4 py-3">{a.mess_included ? <Badge tone="success">Included</Badge> : <Badge tone="neutral">No</Badge>}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => vacateRoom(a)} className="text-rose-500 hover:text-rose-700 text-xs font-medium flex items-center gap-1 ml-auto"><LogOut size={13} /> Vacate</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "gatepass" && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Gate Passes</h3>
            <Button onClick={() => setPassOpen(true)}><KeyRound size={14} /> New Gate Pass</Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Student</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Out Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Expected Return</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Destination</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {gatePasses.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No gate passes yet.</td></tr> :
                 gatePasses.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.students?.full_name ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone="info">{p.pass_type}</Badge></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(p.out_date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{p.expected_return ? new Date(p.expected_return).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.destination ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={p.status === "Completed" ? "success" : p.status === "Approved" ? "info" : p.status === "Rejected" ? "error" : "warning"}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "Pending" && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => updatePassStatus(p, "Approved")} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Approve</button>
                          <button onClick={() => updatePassStatus(p, "Rejected")} className="text-rose-600 hover:text-rose-800 text-xs font-medium">Reject</button>
                        </div>
                      )}
                      {p.status === "Approved" && <button onClick={() => updatePassStatus(p, "Completed")} className="text-sky-600 hover:text-sky-800 text-xs font-medium">Complete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add Room Modal */}
      <RoomFormModal open={addRoomOpen} onClose={() => setAddRoomOpen(false)} onSaved={() => { setAddRoomOpen(false); loadRooms(); }} />

      {/* Allocate Modal */}
      <Modal open={allocOpen} onClose={() => setAllocOpen(false)} title="Allocate Room" size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAllocOpen(false)}>Cancel</Button><Button onClick={allocateRoom} disabled={!allocStudent || !allocRoom}>Allocate</Button></div>}>
        <div className="space-y-3">
          <StudentSearchBar selected={allocStudent} onSelect={setAllocStudent} />
          <SelectField label="Room" placeholder="Select room" value={allocRoom} onChange={(e) => setAllocRoom(e.target.value)}
            options={rooms.filter((r) => r.status !== "Full" && r.status !== "Maintenance").map((r) => ({ value: r.id, label: `${r.room_no} - ${r.block_name} (${r.current_occupancy}/${r.capacity})` }))} />
        </div>
      </Modal>

      {/* Fee Modal */}
      <Modal open={feeOpen} onClose={() => setFeeOpen(false)} title="Collect Hostel Fee" size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setFeeOpen(false)}>Cancel</Button><Button onClick={collectFee} disabled={!feeStudent}>Collect</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><StudentSearchBar selected={feeStudent} onSelect={setFeeStudent} /></div>
          <Field label="Amount (₹)" type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
          <Field label="Receipt No" value={feeReceipt} onChange={(e) => setFeeReceipt(e.target.value)} />
          <SelectField label="Month" value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en-US", { month: "long" }) }))} />
          <Field label="Year" type="number" value={feeYear} onChange={(e) => setFeeYear(e.target.value)} />
          <SelectField label="Payment Method" value={feePaymentMethod} onChange={(e) => setFeePaymentMethod(e.target.value)}
            options={["Cash", "UPI", "Card", "Cheque"].map((m) => ({ value: m, label: m }))} />
        </div>
      </Modal>

      {/* Gate Pass Modal */}
      <Modal open={passOpen} onClose={() => setPassOpen(false)} title="New Gate Pass" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPassOpen(false)}>Cancel</Button><Button onClick={createPass} disabled={!passStudent}>Create Pass</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><StudentSearchBar selected={passStudent} onSelect={setPassStudent} /></div>
          <SelectField label="Pass Type" value={passForm.pass_type} onChange={(e) => setPassForm({ ...passForm, pass_type: e.target.value })}
            options={["Exit", "Entry", "Outing", "Home Visit"].map((t) => ({ value: t, label: t }))} />
          <Field label="Out Date & Time" type="datetime-local" value={passForm.out_date} onChange={(e) => setPassForm({ ...passForm, out_date: e.target.value })} />
          <Field label="Expected Return" type="datetime-local" value={passForm.expected_return} onChange={(e) => setPassForm({ ...passForm, expected_return: e.target.value })} />
          <Field label="Destination" value={passForm.destination} onChange={(e) => setPassForm({ ...passForm, destination: e.target.value })} />
          <Field label="Contact Person" value={passForm.contact_person} onChange={(e) => setPassForm({ ...passForm, contact_person: e.target.value })} />
          <Field label="Contact Phone" value={passForm.contact_phone} onChange={(e) => setPassForm({ ...passForm, contact_phone: e.target.value })} />
          <div className="sm:col-span-2"><TextareaField label="Reason" value={passForm.reason} onChange={(e) => setPassForm({ ...passForm, reason: e.target.value })} rows={2} placeholder="Reason for gate pass…" /></div>
        </div>
      </Modal>
    </div>
  );
}

function RoomFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ room_no: "", block_name: "A Block", floor: "1", capacity: "2", room_type: "Shared", monthly_fee: "5000" });

  const save = async () => {
    await supabase.from("hostel_rooms").insert({
      ...form, floor: Number(form.floor), capacity: Number(form.capacity),
      monthly_fee: Number(form.monthly_fee), current_occupancy: 0, status: "Available",
    });
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Hostel Room" size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Room No" value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} />
        <Field label="Block Name" value={form.block_name} onChange={(e) => setForm({ ...form, block_name: e.target.value })} />
        <Field label="Floor" type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
        <Field label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        <SelectField label="Room Type" value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })}
          options={["Single", "Shared", "Dormitory"].map((t) => ({ value: t, label: t }))} />
        <Field label="Monthly Fee (₹)" type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} />
      </div>
    </Modal>
  );
}
