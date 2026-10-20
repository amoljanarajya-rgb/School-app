import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Bus as BusIcon, Route as RouteIcon, UserPlus, MapPin, Users, Phone, BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Bus, BusRoute, StudentBusMapping } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatTime } from "@/lib/format";

type BusWithRoutes = Bus & { bus_routes?: BusRoute[] };
type MappingRow = StudentBusMapping & {
  students?: { full_name: string; admission_no: string };
  buses?: { bus_no: string };
  bus_routes?: { route_name: string } | null;
};

type Tab = "fleet" | "routes" | "mappings";

export function TransportModule() {
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState<Tab>("fleet");
  const [buses, setBuses] = useState<BusWithRoutes[]>([]);
  const [routes, setRoutes] = useState<(BusRoute & { buses?: { bus_no: string } })[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [b, r, m] = await Promise.all([
      supabase.from("buses").select("*, bus_routes(*)").order("bus_no"),
      supabase.from("bus_routes").select("*, buses(bus_no)").order("route_name"),
      supabase.from("student_bus_mappings").select("*, students(full_name, admission_no), buses(bus_no), bus_routes(route_name)").order("created_at", { ascending: false }),
    ]);
    const firstError = [b, r, m].find((x) => x.error);
    if (firstError?.error) setError(firstError.error.message);
    else {
      setBuses((b.data ?? []) as BusWithRoutes[]);
      setRoutes((r.data ?? []) as (BusRoute & { buses?: { bus_no: string } })[]);
      setMappings((m.data ?? []) as MappingRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const totalCapacity = buses.reduce((s, b) => s + b.capacity, 0);
    const activeBuses = buses.filter((b) => b.status === "Active").length;
    return { totalCapacity, activeBuses, totalRoutes: routes.length, assigned: mappings.length };
  }, [buses, routes, mappings]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Transport & Bus Management</h2>
        <p className="text-slate-500 mt-1">Bus fleet, route tracking, and student-to-bus mapping.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Buses" value={buses.length} hint={`${stats.activeBuses} active`} icon={<BusIcon size={18} />} />
        <MiniStat label="Routes" value={stats.totalRoutes} icon={<RouteIcon size={18} />} />
        <MiniStat label="Total Capacity" value={stats.totalCapacity} hint="seats" icon={<Users size={18} />} />
        <MiniStat label="Students Assigned" value={stats.assigned} icon={<UserPlus size={18} />} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["fleet", "Bus Fleet"], ["routes", "Routes"], ["mappings", "Student Mapping"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm">{error}</div>
      ) : tab === "fleet" ? (
        <FleetPanel buses={buses} onChanged={load} />
      ) : tab === "routes" ? (
        <RoutesPanel buses={buses} routes={routes} onChanged={load} />
      ) : (
        <MappingsPanel buses={buses} routes={routes} mappings={mappings} onChanged={load} />
      )}
    </div>
  );
}

function FleetPanel({ buses, onChanged }: { buses: BusWithRoutes[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bus_no: "", capacity: "30", driver_name: "", driver_phone: "", driver_license: "", status: "Active" as Bus["status"] });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.bus_no.trim() || !form.driver_name.trim()) throw new Error("Bus no and driver name are required.");
      const { error } = await supabase.from("buses").insert({
        bus_no: form.bus_no.trim(),
        capacity: Number(form.capacity),
        driver_name: form.driver_name.trim(),
        driver_phone: form.driver_phone || null,
        driver_license: form.driver_license || null,
        status: form.status,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ bus_no: "", capacity: "30", driver_name: "", driver_phone: "", driver_license: "", status: "Active" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this bus? Related routes and mappings will also be removed.")) return;
    await supabase.from("buses").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Bus Fleet</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Bus</Button>
      </div>
      <div className="overflow-x-auto">
        {buses.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No buses registered.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Bus No</th>
                <th className="text-left font-medium px-4 py-3">Capacity</th>
                <th className="text-left font-medium px-4 py-3">Driver</th>
                <th className="text-left font-medium px-4 py-3">Contact</th>
                <th className="text-left font-medium px-4 py-3">License</th>
                <th className="text-left font-medium px-4 py-3">Routes</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buses.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.bus_no}</td>
                  <td className="px-4 py-3 text-slate-700">{b.capacity}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{b.driver_name}</td>
                  <td className="px-4 py-3 text-slate-600">{b.driver_phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{b.driver_license ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{b.bus_routes?.length ?? 0}</td>
                  <td className="px-4 py-3"><Badge tone={b.status === "Active" ? "success" : b.status === "Maintenance" ? "warning" : "neutral"}>{b.status}</Badge></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(b.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Bus" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bus No" required value={form.bus_no} onChange={(e) => setForm({ ...form, bus_no: e.target.value })} placeholder="e.g. BUS-01" />
            <Field label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <Field label="Driver Name" required value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Driver Phone" value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} />
            <Field label="Driver License" value={form.driver_license} onChange={(e) => setForm({ ...form, driver_license: e.target.value })} />
          </div>
          <SelectField label="Status" options={["Active", "Maintenance", "Retired"].map((s) => ({ value: s, label: s }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Bus["status"] })} />
        </div>
      </Modal>
    </div>
  );
}

function RoutesPanel({ buses, routes, onChanged }: { buses: BusWithRoutes[]; routes: (BusRoute & { buses?: { bus_no: string } })[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bus_id: "", route_name: "", pickup_points: "", start_time: "07:00", end_time: "08:00" });

  const save = async () => {
    setSaving(true);
    try {
      if (!form.bus_id || !form.route_name.trim()) throw new Error("Bus and route name are required.");
      const { error } = await supabase.from("bus_routes").insert({
        bus_id: form.bus_id,
        route_name: form.route_name.trim(),
        pickup_points: form.pickup_points || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
      });
      if (error) throw error;
      setOpen(false);
      setForm({ bus_id: "", route_name: "", pickup_points: "", start_time: "07:00", end_time: "08:00" });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this route?")) return;
    await supabase.from("bus_routes").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Bus Routes</h3>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add Route</Button>
      </div>
      <div className="overflow-x-auto">
        {routes.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No routes defined.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Route</th>
                <th className="text-left font-medium px-4 py-3">Bus</th>
                <th className="text-left font-medium px-4 py-3">Pickup Points</th>
                <th className="text-left font-medium px-4 py-3">Timing</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.route_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.buses?.bus_no ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {r.pickup_points ? (
                      <div className="flex flex-wrap gap-1">
                        {r.pickup_points.split("\n").filter(Boolean).slice(0, 3).map((p, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded px-1.5 py-0.5"><MapPin size={10} /> {p.trim()}</span>
                        ))}
                        {r.pickup_points.split("\n").length > 3 && <span className="text-xs text-slate-400">+{r.pickup_points.split("\n").length - 3} more</span>}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatTime(r.start_time)} – {formatTime(r.end_time)}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Route" size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add"}</Button></div>}>
        <div className="space-y-4">
          <SelectField label="Bus" required placeholder="Select bus" options={buses.map((b) => ({ value: b.id, label: `${b.bus_no} (${b.driver_name})` }))} value={form.bus_id} onChange={(e) => setForm({ ...form, bus_id: e.target.value })} />
          <Field label="Route Name" required value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })} placeholder="e.g. Route A — North Campus" />
          <TextareaField label="Pickup Points" rows={3} value={form.pickup_points} onChange={(e) => setForm({ ...form, pickup_points: e.target.value })} placeholder="One per line:&#10;Main Gate&#10;Library Stop&#10;North Gate" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Time" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Field label="End Time" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MappingsPanel({ buses, routes, mappings, onChanged }: { buses: BusWithRoutes[]; routes: (BusRoute & { buses?: { bus_no: string } })[]; mappings: MappingRow[]; onChanged: () => void }) {
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [busId, setBusId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [pickupPoint, setPickupPoint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routesForBus = routes.filter((r) => r.bus_id === busId);

  const assign = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedStudent) throw new Error("Select a student.");
      if (!busId) throw new Error("Select a bus.");
      const { error } = await supabase.from("student_bus_mappings").upsert({
        student_id: selectedStudent.id,
        bus_id: busId,
        route_id: routeId || null,
        pickup_point: pickupPoint || null,
      }, { onConflict: "student_id" });
      if (error) throw error;
      setSelectedStudent(null);
      setBusId("");
      setRouteId("");
      setPickupPoint("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("student_bus_mappings").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="space-y-6">
      {/* Assignment form */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><UserPlus size={18} className="text-sky-600" /> Assign Student to Bus</h3>
        {error && <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} label="Student" />
          <SelectField label="Bus" placeholder="Select bus" options={buses.map((b) => ({ value: b.id, label: `${b.bus_no} — ${b.driver_name}` }))} value={busId} onChange={(e) => { setBusId(e.target.value); setRouteId(""); }} />
          <SelectField label="Route (optional)" placeholder="Select route for this bus" options={routesForBus.map((r) => ({ value: r.id, label: r.route_name }))} value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!busId} />
          <Field label="Pickup Point" value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="e.g. Main Gate" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={assign} disabled={saving || !selectedStudent || !busId}>{saving ? "Assigning…" : "Assign to Bus"}</Button>
        </div>
      </div>

      {/* Mapping list */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Student-Bus Assignments</h3>
        </div>
        <div className="overflow-x-auto">
          {mappings.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No students assigned to buses yet.</p> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Student</th>
                  <th className="text-left font-medium px-4 py-3">Bus</th>
                  <th className="text-left font-medium px-4 py-3">Route</th>
                  <th className="text-left font-medium px-4 py-3">Pickup Point</th>
                  <th className="text-right font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{m.students?.full_name ?? "—"}</p><p className="text-xs text-slate-500">{m.students?.admission_no ?? ""}</p></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.buses?.bus_no ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{m.bus_routes?.route_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{m.pickup_point ?? "—"}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(m.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button></td>
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
