import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Zap } from "lucide-react";

export type EnergyPoint = { day: string; kwh: number; cost: number };

type Props = {
  data: EnergyPoint[];
  height?: number;
};

/**
 * Wave-style energy consumption chart: smooth, stacked translucent areas
 * producing a wave-like silhouette across the time axis.
 */
export function EnergyWaveChart({ data, height = 220 }: Props) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-violet-50 text-violet-600 p-1.5 ring-1 ring-violet-100">
            <Zap size={16} />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Energy Consumption</h3>
            <p className="text-[11px] text-slate-500">Daily kWh (last 14 days)</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-violet-600 tabular-nums">
          {data.reduce((s, d) => s + d.kwh, 0).toLocaleString("en-IN")} kWh
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="waveGrad1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="waveGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              name === "kwh" ? `${value} kWh` : `₹${Number(value).toLocaleString("en-IN")}`,
              name === "kwh" ? "Consumption" : "Cost",
            ]}
          />
          <Area
            type="monotone"
            dataKey="kwh"
            stroke="#8b5cf6"
            strokeWidth={2.5}
            fill="url(#waveGrad1)"
            dot={false}
            activeDot={{ r: 5, fill: "#8b5cf6" }}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="#06b6d4"
            strokeWidth={2}
            fill="url(#waveGrad2)"
            dot={false}
            activeDot={{ r: 4, fill: "#06b6d4" }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 mt-1 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> kWh</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500" /> Cost</span>
      </div>
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
