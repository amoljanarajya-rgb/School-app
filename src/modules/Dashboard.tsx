import { useEffect, useState } from "react";
import {
  Users,
  UserCog,
  CalendarCheck,
  Wallet,
  Receipt,
  TrendingUp,
  CalendarOff,
  Gauge,
  ArrowRight,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { formatCurrency, formatINRShort, formatDate, classNamesForStatus } from "@/lib/format";
import { useChartData } from "@/lib/useChartData";
import { FinancialTrendChart } from "@/components/charts/FinancialTrendChart";
import { TeacherDistributionChart } from "@/components/charts/TeacherDistributionChart";
import { RoomUtilizationDonut } from "@/components/charts/RoomUtilizationDonut";
import { LibraryCheckoutsChart } from "@/components/charts/LibraryCheckoutsChart";
import { AssetDepreciationChart } from "@/components/charts/AssetDepreciationChart";
import { EnergyWaveChart } from "@/components/charts/EnergyWaveChart";

type ModuleKey = "dashboard" | "students" | "finance" | "hr" | "analytics" | "api";

type Stats = {
  studentCount: number;
  activeStudents: number;
  staffCount: number;
  attendancePct: number;
  collectedToday: number;
  feesDue: number;
  income: number;
  leavesToday: number;
  capacityUsed: number;
  recentCollections: { id: string; amount: number; payment_date: string; receipt_no: string | null }[];
  recentStudents: { id: string; full_name: string; admission_no: string; enrollment_status: string; created_at: string }[];
};

export function Dashboard({ onNavigate }: { onNavigate: (m: ModuleKey) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);

      const [
        students,
        staff,
        collectionsToday,
        collectionsAll,
        income,
        checkouts,
        rooms,
        leavesToday,
        attendanceToday,
      ] = await Promise.all([
        supabase.from("students").select("enrollment_status"),
        supabase.from("staff").select("staff_type"),
        supabase.from("fee_collections").select("amount").gte("payment_date", todayStr),
        supabase.from("fee_collections").select("amount"),
        supabase.from("income_entries").select("amount"),
        supabase.from("library_checkouts").select("id, status"),
        supabase.from("rooms").select("id, is_occupied, current_usage, capacity"),
        supabase.from("staff_leaves").select("id").lte("start_date", todayStr).gte("end_date", todayStr),
        supabase.from("staff_attendance").select("status").eq("attendance_date", todayStr),
      ]);

      const firstError = [students, staff, collectionsToday, collectionsAll, income, checkouts, rooms, leavesToday, attendanceToday].find((r) => r.error);
      if (firstError?.error) {
        setError(firstError.error.message);
        setLoading(false);
        return;
      }

      const studentRows = students.data as { enrollment_status: string }[];
      const staffRows = staff.data as { staff_type: string }[];
      const incomeRows = income.data as { amount: number }[];
      const checkoutRows = checkouts.data as { id: string; status: string }[];
      const roomRows = rooms.data as { id: string; is_occupied: boolean; current_usage: number; capacity: number }[];
      const attendanceRows = attendanceToday.data as { status: string }[];

      const collectedToday = (collectionsToday.data as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
      const totalCollected = (collectionsAll.data as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);

      // Annual structured fees total * student count as a rough "fees due" proxy
      const { data: structures } = await supabase.from("fee_structures").select("amount");
      const annualStructured = (structures ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
      const feesDue = Math.max(0, annualStructured * studentRows.length - totalCollected);

      const totalCapacity = roomRows.reduce((s, r) => s + r.capacity, 0);
      const usedCapacity = roomRows.reduce((s, r) => s + r.current_usage, 0);
      const capacityUsed = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;

      const present = attendanceRows.filter((r) => r.status === "Present" || r.status === "Late").length;
      const attendancePct = attendanceRows.length > 0 ? Math.round((present / attendanceRows.length) * 100) : 0;

      const recentCollectionsReq = await supabase
        .from("fee_collections")
        .select("id, amount, payment_date, receipt_no")
        .order("payment_date", { ascending: false })
        .limit(5);
      const recentStudentsReq = await supabase
        .from("students")
        .select("id, full_name, admission_no, enrollment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      setStats({
        studentCount: studentRows.length,
        activeStudents: studentRows.filter((r) => r.enrollment_status === "Active").length,
        staffCount: staffRows.length,
        attendancePct,
        collectedToday,
        feesDue,
        income: incomeRows.reduce((s, r) => s + Number(r.amount), 0),
        leavesToday: (leavesToday.data as { id: string }[]).length,
        capacityUsed,
        recentCollections: (recentCollectionsReq.data as Stats["recentCollections"]) ?? [],
        recentStudents: (recentStudentsReq.data as Stats["recentStudents"]) ?? [],
      });
      setLoading(false);
    })();
  }, []);

  const charts = useChartData();

  if (loading) return <DashboardSkeleton />;
  if (error || !stats)
    return (
      <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-6 text-rose-800 text-sm">
        Couldn't load dashboard data: {error ?? "unknown error"}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* KPI Row - 8 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Students"
          value={stats.studentCount}
          hint={`${stats.activeStudents} active`}
          tone="info"
          icon={<Users size={20} />}
        />
        <StatCard
          label="Total Staff"
          value={stats.staffCount}
          hint="Teaching & non-teaching"
          tone="success"
          icon={<UserCog size={20} />}
        />
        <StatCard
          label="Attendance %"
          value={`${stats.attendancePct}%`}
          hint="Today's roll call"
          tone={stats.attendancePct >= 75 ? "success" : "warning"}
          icon={<CalendarCheck size={20} />}
        />
        <StatCard
          label="Collected Today"
          value={formatCurrency(stats.collectedToday)}
          hint="Fee receipts today"
          tone="info"
          icon={<Wallet size={20} />}
        />
        <StatCard
          label="Fees Due"
          value={formatINRShort(stats.feesDue)}
          hint={formatCurrency(stats.feesDue)}
          tone="error"
          icon={<Receipt size={20} />}
        />
        <StatCard
          label="Income"
          value={formatCurrency(stats.income)}
          hint="Total recorded"
          tone="success"
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Leaves Today"
          value={stats.leavesToday}
          hint="Staff on leave"
          tone="warning"
          icon={<CalendarOff size={20} />}
        />
        <StatCard
          label="Capacity Used"
          value={`${stats.capacityUsed}%`}
          hint="Room utilization"
          tone={stats.capacityUsed > 80 ? "error" : stats.capacityUsed > 50 ? "warning" : "success"}
          icon={<Gauge size={20} />}
        />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Recent Fee Collections" action={{ label: "View Finance", onClick: () => onNavigate("finance") }}>
          {stats.recentCollections.length === 0 ? (
            <EmptyRow text="No collections yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentCollections.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.receipt_no ?? "—"}</p>
                    <p className="text-xs text-slate-500">{formatDate(c.payment_date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{formatCurrency(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Admissions" action={{ label: "View Students", onClick: () => onNavigate("students") }}>
          {stats.recentStudents.length === 0 ? (
            <EmptyRow text="No students yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{s.full_name}</p>
                    <p className="text-xs text-slate-500">{s.admission_no}</p>
                  </div>
                  <Badge tone={classNamesForStatus(s.enrollment_status)}>{s.enrollment_status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Charts row 1: Financial trend + Teacher distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FinancialTrendChart data={charts.financialTrend} />
        </div>
        <TeacherDistributionChart data={charts.teacherDist} />
      </div>

      {/* Charts row 2: Campus analytics cards */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Campus Analytics</h3>
          <p className="text-xs text-slate-400 mt-0.5">Room utilization, library activity, asset health, and energy consumption</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RoomUtilizationDonut
            utilization={charts.roomUtilization}
            occupiedCount={charts.occupiedRooms}
            totalRooms={charts.totalRooms}
          />
          <LibraryCheckoutsChart data={charts.libraryCheckouts} />
          <AssetDepreciationChart data={charts.depreciation} />
          <EnergyWaveChart data={charts.energyWave} />
        </div>
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ShortcutCard label="Student Information" desc="Admission, enrollment, profiles" onClick={() => onNavigate("students")} icon={<Users size={22} />} />
        <ShortcutCard label="Finance & Fees" desc="Collections, income, expenses" onClick={() => onNavigate("finance")} icon={<Wallet size={22} />} />
        <ShortcutCard label="Energy Consumption" desc="Rooms, library, assets, energy" onClick={() => onNavigate("analytics")} icon={<Zap size={22} />} />
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {action && (
          <button onClick={action.onClick} className="text-sm text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1">
            {action.label}
            <ArrowRight size={14} />
          </button>
        )}
      </div>
      <div className="px-5 py-2">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>;
}

function ShortcutCard({ label, desc, onClick, icon }: { label: string; desc: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 hover:shadow-md hover:ring-sky-300 transition group"
    >
      <div className="rounded-xl bg-sky-50 text-sky-600 p-2.5 w-fit group-hover:bg-sky-100 transition">{icon}</div>
      <p className="mt-3 font-semibold text-slate-900">{label}</p>
      <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 bg-slate-200 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-72 bg-slate-200 rounded-2xl" />
        <div className="h-72 bg-slate-200 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-60 bg-slate-200 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
