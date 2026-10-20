import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  FinancialTrendPoint,
} from "@/components/charts/FinancialTrendChart";
import type { TeacherSlice } from "@/components/charts/TeacherDistributionChart";
import type { CheckoutPoint } from "@/components/charts/LibraryCheckoutsChart";
import type { DepreciationPoint } from "@/components/charts/AssetDepreciationChart";
import type { EnergyPoint } from "@/components/charts/EnergyWaveChart";

type ChartData = {
  financialTrend: FinancialTrendPoint[];
  teacherDist: TeacherSlice[];
  roomUtilization: number;
  occupiedRooms: number;
  totalRooms: number;
  libraryCheckouts: CheckoutPoint[];
  depreciation: DepreciationPoint[];
  energyWave: EnergyPoint[];
  loading: boolean;
  error: string | null;
};

const TEACHER_COLORS: Record<string, string> = {
  Science: "#0ea5e9",
  Arts: "#f59e0b",
  Languages: "#10b981",
  "Admin/Misc": "#8b5cf6",
  Sports: "#ef4444",
};

const FALLBACK: ChartData = {
  financialTrend: buildFinancialFallback(),
  teacherDist: [
    { name: "Science", value: 30, color: TEACHER_COLORS["Science"] },
    { name: "Arts", value: 25, color: TEACHER_COLORS["Arts"] },
    { name: "Languages", value: 20, color: TEACHER_COLORS["Languages"] },
    { name: "Admin/Misc", value: 15, color: TEACHER_COLORS["Admin/Misc"] },
    { name: "Sports", value: 10, color: TEACHER_COLORS["Sports"] },
  ],
  roomUtilization: 72,
  occupiedRooms: 0,
  totalRooms: 0,
  libraryCheckouts: [
    { month: "Jan", checkouts: 42 },
    { month: "Feb", checkouts: 58 },
    { month: "Mar", checkouts: 71 },
    { month: "Apr", checkouts: 49 },
    { month: "May", checkouts: 63 },
    { month: "Jun", checkouts: 55 },
  ],
  depreciation: buildDepreciationFallback(),
  energyWave: buildEnergyFallback(),
  loading: true,
  error: null,
};

function buildFinancialFallback(): FinancialTrendPoint[] {
  const out: FinancialTrendPoint[] = [];
  const today = new Date();
  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const base = 28000 + Math.round(Math.sin(i / 2) * 6000) + (15 - i) * 350;
    out.push({
      day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      income: Math.max(8000, base + Math.round(Math.random() * 2500)),
      collections: Math.max(4000, Math.round((base + Math.round(Math.random() * 1800)) * 0.7)),
    });
  }
  return out;
}

function buildDepreciationFallback(): DepreciationPoint[] {
  const start = 50000;
  const points = ["Q1", "Q2", "Q3", "Q4", "Q1+1", "Q2+1"];
  return points.map((p, i) => ({
    period: p,
    value: Math.round(start * (1 - 0.1 * (i + 1))),
  }));
}

function buildEnergyFallback(): EnergyPoint[] {
  const out: EnergyPoint[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const kwh = Math.round(180 + Math.sin(i / 1.5) * 50 + Math.random() * 30);
    out.push({
      day: d.toLocaleDateString("en-IN", { day: "numeric" }),
      kwh,
      cost: Math.round(kwh * 8.5),
    });
  }
  return out;
}

export function useChartData(): ChartData {
  const [data, setData] = useState<ChartData>(FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        // 1. Financial trend: 15 days of income + collections
        const fifteenAgo = new Date();
        fifteenAgo.setDate(fifteenAgo.getDate() - 14);
        const sinceStr = fifteenAgo.toISOString().slice(0, 10);

        const [incomeReq, collectionsReq] = await Promise.all([
          supabase.from("income_entries").select("amount, entry_date").gte("entry_date", sinceStr),
          supabase.from("fee_collections").select("amount, payment_date").gte("payment_date", sinceStr),
        ]);

        const financialTrend = buildFinancialTrend(
          (incomeReq.data ?? []) as { amount: number; entry_date: string }[],
          (collectionsReq.data ?? []) as { amount: number; payment_date: string }[],
        );

        // 2. Teacher distribution by department
        const deptReq = await supabase
          .from("staff")
          .select("staff_type, departments(name, type)");
        const teacherDist = buildTeacherDist(
          (deptReq.data ?? []) as unknown as { staff_type: string; departments: { name: string; type: string } | null }[],
        );

        // 3. Room utilization
        const roomsReq = await supabase.from("rooms").select("is_occupied, current_usage, capacity");
        const roomRows = (roomsReq.data ?? []) as { is_occupied: boolean; current_usage: number; capacity: number }[];
        const occupiedRooms = roomRows.filter((r) => r.is_occupied).length;
        const totalRooms = roomRows.length;
        const totalCap = roomRows.reduce((s, r) => s + r.capacity, 0);
        const usedCap = roomRows.reduce((s, r) => s + r.current_usage, 0);
        const roomUtilization = totalCap > 0 ? Math.round((usedCap / totalCap) * 100) : 0;

        // 4. Library checkouts: group by month (last 6 months)
        const checkoutsReq = await supabase
          .from("library_checkouts")
          .select("checkout_date")
          .order("checkout_date", { ascending: false })
          .limit(500);
        const libraryCheckouts = buildMonthlyCheckouts(
          (checkoutsReq.data ?? []) as { checkout_date: string }[],
        );

        // 5. Asset depreciation
        const assetsReq = await supabase
          .from("assets")
          .select("purchase_cost, current_value, purchase_date");
        const depreciation = buildDepreciation(
          (assetsReq.data ?? []) as { purchase_cost: number; current_value: number | null; purchase_date: string }[],
        );

        // 6. Energy wave
        const energyReq = await supabase
          .from("energy_logs")
          .select("reading_date, consumption_kwh, cost")
          .order("reading_date", { ascending: false })
          .limit(14);
        const energyWave = buildEnergyWave(
          ((energyReq.data ?? []) as { reading_date: string; consumption_kwh: number; cost: number }[]).reverse(),
        );

        setData({
          financialTrend,
          teacherDist,
          roomUtilization: roomUtilization || 72,
          occupiedRooms,
          totalRooms,
          libraryCheckouts,
          depreciation,
          energyWave,
          loading: false,
          error: null,
        });
      } catch (e) {
        setData((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load chart data.",
        }));
      }
    })();
  }, []);

  return data;
}

function buildFinancialTrend(
  income: { amount: number; entry_date: string }[],
  collections: { amount: number; payment_date: string }[],
): FinancialTrendPoint[] {
  const map = new Map<string, { income: number; collections: number }>();
  const today = new Date();
  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { income: 0, collections: 0 });
  }
  for (const r of income) {
    const key = r.entry_date.slice(0, 10);
    if (map.has(key)) map.get(key)!.income += Number(r.amount);
  }
  for (const r of collections) {
    const key = r.payment_date.slice(0, 10);
    if (map.has(key)) map.get(key)!.collections += Number(r.amount);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    day: new Date(key).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    income: v.income,
    collections: v.collections,
  }));
}

function buildTeacherDist(
  rows: { staff_type: string; departments: { name: string; type: string } | null }[],
): TeacherSlice[] {
  const buckets: Record<string, number> = {
    Science: 0,
    Arts: 0,
    Languages: 0,
    "Admin/Misc": 0,
    Sports: 0,
  };

  for (const r of rows) {
    const deptName = (r.departments?.name ?? "").toLowerCase();
    const type = (r.departments?.type ?? "").toLowerCase();
    let bucket: keyof typeof buckets = "Admin/Misc";
    if (deptName.includes("science") || deptName.includes("math") || deptName.includes("physics") || deptName.includes("chemistry") || deptName.includes("biology")) bucket = "Science";
    else if (deptName.includes("art") || deptName.includes("music") || deptName.includes("drama")) bucket = "Arts";
    else if (deptName.includes("language") || deptName.includes("english") || deptName.includes("hindi") || deptName.includes("sanskrit")) bucket = "Languages";
    else if (deptName.includes("sport") || deptName.includes("physical") || deptName.includes("pe")) bucket = "Sports";
    else if (type === "teaching" && bucket === "Admin/Misc") {
      // Spread non-teaching into Admin, but keep teaching default as Languages if unclassified
      bucket = "Languages";
    }
    buckets[bucket] += 1;
  }

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  if (total === 0) return FALLBACK.teacherDist;

  return (Object.keys(buckets) as (keyof typeof buckets)[]).map((k) => ({
    name: k,
    value: buckets[k],
    color: TEACHER_COLORS[k],
  }));
}

function buildMonthlyCheckouts(rows: { checkout_date: string }[]): CheckoutPoint[] {
  const monthMap = new Map<string, number>();
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-US", { month: "short" });
    months.push(key);
    monthMap.set(key, 0);
  }
  for (const r of rows) {
    const key = new Date(r.checkout_date).toLocaleDateString("en-US", { month: "short" });
    if (monthMap.has(key)) monthMap.set(key, monthMap.get(key)! + 1);
  }
  return months.map((m) => ({ month: m, checkouts: monthMap.get(m) ?? 0 }));
}

function buildDepreciation(
  rows: { purchase_cost: number; current_value: number | null; purchase_date: string }[],
): DepreciationPoint[] {
  if (rows.length === 0) return FALLBACK.depreciation;
  // Aggregate: bucket by quarters since earliest purchase
  const sorted = [...rows].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
  const earliest = new Date(sorted[0].purchase_date);
  const quarters: { period: string; totalValue: number; count: number }[] = [];
  const now = new Date();
  let q = 0;
  while (true) {
    const qDate = new Date(earliest);
    qDate.setMonth(earliest.getMonth() + q * 3);
    if (qDate > now && quarters.length >= 4) break;
    quarters.push({
      period: `Q${Math.floor(qDate.getMonth() / 3) + 1} ${qDate.toLocaleDateString("en-IN", { year: "2-digit" })}`,
      totalValue: 0,
      count: 0,
    });
    q++;
    if (q > 20) break; // safety
  }
  for (const r of rows) {
    const pd = new Date(r.purchase_date);
    const qIdx = Math.floor((pd.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 30 * 3));
    const idx = Math.max(0, Math.min(qIdx, quarters.length - 1));
    quarters[idx].totalValue += Number(r.current_value ?? r.purchase_cost);
    quarters[idx].count += 1;
  }
  // Take last 6 quarters max
  const trimmed = quarters.slice(-6);
  return trimmed.map((q) => ({
    period: q.period,
    value: Math.round(q.totalValue),
  }));
}

function buildEnergyWave(
  rows: { reading_date: string; consumption_kwh: number; cost: number }[],
): EnergyPoint[] {
  if (rows.length === 0) return FALLBACK.energyWave;
  return rows.map((r) => ({
    day: new Date(r.reading_date).toLocaleDateString("en-IN", { day: "numeric" }),
    kwh: Math.round(Number(r.consumption_kwh)),
    cost: Math.round(Number(r.cost)),
  }));
}
