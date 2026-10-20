import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingDown } from "lucide-react";

export type DepreciationPoint = { period: string; value: number };

type Props = {
  data: DepreciationPoint[];
  /** Currency formatting helper */
  height?: number;
};

export function AssetDepreciationChart({ data, height = 220 }: Props) {
  const start = data[0]?.value ?? 0;
  const end = data[data.length - 1]?.value ?? 0;
  const loss = start - end;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-rose-50 text-rose-600 p-1.5 ring-1 ring-rose-100">
            <TrendingDown size={16} />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Asset Depreciation</h3>
            <p className="text-[11px] text-slate-500">Current value over time</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-rose-600 tabular-nums">
          −₹{loss.toLocaleString("en-IN")}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id="depLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Value"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#depLineGrad)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#f43f5e", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#f43f5e" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fff",
  fontSize: 12,
  boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
  padding: "8px 12px",
} as const;
