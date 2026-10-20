import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";

export type FinancialTrendPoint = { day: string; income: number; collections: number };

type Props = {
  data: FinancialTrendPoint[];
  height?: number;
};

export function FinancialTrendChart({ data, height = 280 }: Props) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">Financial Trend (15 days)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Income & fee collection curve</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          <TrendingUp size={13} /> Income
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="collectionsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              `₹${Number(value).toLocaleString("en-IN")}`,
              name === "income" ? "Income" : "Collections",
            ]}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#incomeGrad)"
            dot={false}
            activeDot={{ r: 5, fill: "#10b981" }}
          />
          <Area
            type="monotone"
            dataKey="collections"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            fill="url(#collectionsGrad)"
            dot={false}
            activeDot={{ r: 5, fill: "#0ea5e9" }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 mt-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Income</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Collections</span>
      </div>
    </div>
  );
}

export const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fff",
  fontSize: 12,
  boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
  padding: "8px 12px",
} as const;
