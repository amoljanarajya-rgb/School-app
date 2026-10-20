import { useEffect, useMemo, useState } from "react";
import { QrCode, X, Phone, Check, AlertTriangle, MapPin, Users, Loader2, Navigation, CloudUpload, Wifi, WifiOff, LogOut, LogIn, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Bus, BusRoute, StudentBusMapping } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { Badge } from "@/components/Badge";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useOfflineSync } from "@/lib/useOfflineSync";
import { useQrScanner } from "@/lib/useQrScanner";
import { SyncBanner } from "@/modules/TeacherMobilePortal";

type MappingRow = StudentBusMapping & {
  students?: { full_name: string; admission_no: string; photo_url?: string | null };
  buses?: { bus_no: string };
  bus_routes?: { route_name: string } | null;
};

type BoardingStatus = "pending" | "boarded" | "deboarded";

type BoardingLog = {
  mapping_id: string;
  student_name: string;
  admission_no: string;
  status: BoardingStatus;
  timestamp: string;
  stop: string;
};

export function DriverMobilePortal() {
  const { data: lookups } = useLookups();
  const { state: syncState, enqueue, triggerSync } = useOfflineSync();
  const qr = useQrScanner();
  const [busId, setBusId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scanLog, setScanLog] = useState<BoardingLog[]>([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [tripActive, setTripActive] = useState(false);
  const [tripStartedAt, setTripStartedAt] = useState<string | null>(null);

  const buses = lookups?.buses ?? [];
  const routes = useMemo(() => (lookups?.busRoutes ?? []).filter((r) => r.bus_id === busId), [lookups, busId]);

  useEffect(() => {
    if (!busId) {
      setMappings([]);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("student_bus_mappings")
      .select("*, students(full_name, admission_no, photo_url), buses(bus_no), bus_routes(route_name)")
      .eq("bus_id", busId)
      .order("created_at");
    if (routeId) q = q.eq("route_id", routeId);
    q.then(({ data, error }) => {
      if (!error) setMappings((data ?? []) as MappingRow[]);
      setLoading(false);
    });
  }, [busId, routeId]);

  const boardingMap = useMemo(() => {
    const map = new Map<string, BoardingStatus>();
    scanLog.forEach((log) => map.set(log.mapping_id, log.status));
    return map;
  }, [scanLog]);

  const summary = useMemo(() => {
    const boarded = scanLog.filter((l) => l.status === "boarded").length;
    const deboarded = scanLog.filter((l) => l.status === "deboarded").length;
    return { total: mappings.length, boarded, deboarded, pending: mappings.length - boarded };
  }, [mappings, scanLog]);

  const handleQrScan = (text: string) => {
    // QR format: STUDENT:<admission_no>
    const admissionNo = text.startsWith("STUDENT:") ? text.replace("STUDENT:", "") : text;
    const mapping = mappings.find((m) => m.students?.admission_no === admissionNo);
    if (!mapping) {
      setScanLog((prev) => [{ mapping_id: "", student_name: `Unknown: ${admissionNo}`, admission_no: admissionNo, status: "pending" as BoardingStatus, timestamp: new Date().toISOString(), stop: "—" }, ...prev].slice(0, 50));
      return;
    }
    const currentStatus = boardingMap.get(mapping.id) ?? "pending";
    // Toggle: pending -> boarded -> deboarded
    const nextStatus: BoardingStatus = currentStatus === "pending" ? "boarded" : currentStatus === "boarded" ? "deboarded" : "boarded";
    const log: BoardingLog = {
      mapping_id: mapping.id,
      student_name: mapping.students?.full_name ?? "—",
      admission_no: mapping.students?.admission_no ?? "",
      status: nextStatus,
      timestamp: new Date().toISOString(),
      stop: mapping.pickup_point ?? "—",
    };
    setScanLog((prev) => [log, ...prev.filter((l) => l.mapping_id !== mapping.id)].slice(0, 50));

    // Queue for sync — store boarding log in local DB
    enqueue({
      table: "student_bus_mappings",
      operation: "update",
      payload: { id: mapping.id, boarding_status: nextStatus, boarding_time: log.timestamp },
    });
  };

  const startTrip = () => {
    setTripActive(true);
    setTripStartedAt(new Date().toISOString());
    setScanLog([]);
  };

  const endTrip = async () => {
    setTripActive(false);
    setTripStartedAt(null);
    if (syncState.online) triggerSync();
  };

  const emergencyContacts = [
    { name: "School Office", phone: "+911234567890" },
    { name: "Transport Incharge", phone: "+919876543210" },
    { name: "Principal", phone: "+919812345678" },
    { name: "Ambulance / 108", phone: "108" },
  ];

  const selectedBus = buses.find((b) => b.id === busId);

  return (
    <div className="space-y-5">
      <SyncBanner state={syncState} onSync={triggerSync} />

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Driver Portal</h2>
          <p className="text-slate-500 mt-1">Route student list, QR boarding checklist, and emergency call.</p>
        </div>
        {selectedBus && (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{selectedBus.bus_no}</p>
            <p className="text-xs text-slate-500">{selectedBus.driver_name}</p>
          </div>
        )}
      </div>

      {/* Bus + Route selector */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Bus"
            required
            placeholder="Select bus"
            options={buses.map((b) => ({ value: b.id, label: `${b.bus_no} — ${b.driver_name}` }))}
            value={busId}
            onChange={(e) => { setBusId(e.target.value); setRouteId(""); }}
          />
          <SelectField
            label="Route"
            placeholder="All routes"
            options={routes.map((r) => ({ value: r.id, label: r.route_name }))}
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            disabled={!busId}
          />
        </div>
      </div>

      {/* Trip controls + stats */}
      {busId && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {!tripActive ? (
              <Button onClick={startTrip}><Navigation size={16} /> Start Trip</Button>
            ) : (
              <Button variant="danger" onClick={endTrip}><LogOut size={16} /> End Trip</Button>
            )}
            <Button variant="secondary" onClick={() => { setScanMode(true); qr.start(handleQrScan); }} disabled={!tripActive}>
              <QrCode size={16} /> Scan Student QR
            </Button>
            <div className="ml-auto">
              <button
                onClick={() => setEmergencyOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-rose-700 transition animate-pulse"
              >
                <AlertTriangle size={16} /> Emergency Call
              </button>
            </div>
          </div>

          {tripActive && tripStartedAt && (
            <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 px-4 py-2.5 text-sm text-sky-700 flex items-center gap-2">
              <Navigation size={14} className="animate-pulse" />
              Trip in progress — started at {new Date(tripStartedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DriverStat label="Total Students" value={summary.total} icon={<Users size={15} />} tone="neutral" />
            <DriverStat label="Boarded" value={summary.boarded} icon={<LogIn size={15} />} tone="success" />
            <DriverStat label="Deboarded" value={summary.deboarded} icon={<LogOut size={15} />} tone="info" />
            <DriverStat label="Pending" value={summary.pending} icon={<Clock size={15} />} tone="warning" />
          </div>
        </>
      )}

      {/* QR Scanner overlay */}
      {scanMode && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2"><QrCode size={20} /> Boarding Scan</h3>
              <button onClick={() => { qr.stop(); setScanMode(false); }} className="text-slate-300 hover:text-white"><X size={24} /></button>
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square ring-2 ring-sky-500/50">
              <video ref={qr.videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-sky-400 rounded-xl" />
              </div>
            </div>
            {qr.error && <p className="text-rose-400 text-sm mt-3">{qr.error}</p>}
            {qr.lastScan && (
              <p className="text-emerald-400 text-sm mt-2">
                Scanned: {qr.lastScan.text} → {boardingMap.get(scanLog[0]?.mapping_id ?? "") ?? "—"}
              </p>
            )}
            <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
              {scanLog.slice(0, 10).map((log, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-slate-800 rounded-lg px-3 py-1.5">
                  <span className="text-slate-200">{log.student_name}</span>
                  <Badge tone={log.status === "boarded" ? "success" : log.status === "deboarded" ? "info" : "warning"}>{log.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Student route list */}
      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading route students…</div>
      ) : !busId ? (
        <div className="p-10 text-center text-slate-400 text-sm">Select a bus to view assigned students.</div>
      ) : mappings.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-sm">No students assigned to this bus.</div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Route Students</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tap to toggle boarding status or scan QR</p>
          </div>
          <div className="divide-y divide-slate-100">
            {mappings.map((m) => {
              const status = boardingMap.get(m.id) ?? "pending";
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-slate-100 overflow-hidden shrink-0">
                    {m.students?.photo_url ? (
                      <img src={m.students.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-bold">
                        {m.students?.full_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">{m.students?.full_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{m.students?.admission_no ?? ""}</p>
                    {m.pickup_point && (
                      <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-0.5"><MapPin size={10} /> {m.pickup_point}</p>
                    )}
                  </div>
                  {/* Status toggle */}
                  <button
                    onClick={() => handleQrScan(`STUDENT:${m.students?.admission_no ?? ""}`)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg font-medium transition shrink-0",
                      status === "pending" ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : status === "boarded" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-sky-100 text-sky-700 hover:bg-sky-200",
                    )}
                  >
                    {status === "pending" ? "Mark" : status === "boarded" ? "Boarded ✓" : "Deboarded ✓"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent scan log */}
      {scanLog.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Boarding Log</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {scanLog.slice(0, 20).map((log, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                {log.status === "boarded" ? <LogIn size={16} className="text-emerald-500" /> : log.status === "deboarded" ? <LogOut size={16} className="text-sky-500" /> : <AlertTriangle size={16} className="text-amber-500" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{log.student_name}</p>
                  <p className="text-xs text-slate-500">{log.stop} · {new Date(log.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <Badge tone={log.status === "boarded" ? "success" : log.status === "deboarded" ? "info" : "warning"}>{log.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency call modal */}
      {emergencyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEmergencyOpen(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
                <AlertTriangle size={24} className="text-rose-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Emergency Call</h2>
                <p className="text-sm text-slate-500">Tap a contact to call immediately</p>
              </div>
            </div>
            <div className="space-y-2">
              {emergencyContacts.map((contact) => (
                <a
                  key={contact.phone}
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-3 rounded-xl ring-1 ring-slate-200 px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                    <Phone size={18} className="text-rose-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{contact.name}</p>
                    <p className="text-sm text-slate-500">{contact.phone}</p>
                  </div>
                  <span className="text-xs font-medium text-rose-600">Call →</span>
                </a>
              ))}
            </div>
            <button onClick={() => setEmergencyOpen(false)} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverStat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "success" | "error" | "warning" | "info" | "neutral" }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    error: "bg-rose-50 text-rose-700 ring-rose-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
    neutral: "bg-slate-50 text-slate-700 ring-slate-200",
  };
  return (
    <div className={cn("rounded-xl ring-1 px-3 py-2.5 flex items-center gap-2.5", tones[tone])}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-[11px] mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  );
}
