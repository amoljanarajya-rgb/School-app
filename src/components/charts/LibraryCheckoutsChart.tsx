import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { BookOpen } from "lucide-react";

export type CheckoutPoint = { month: string; checkouts: number };

type Props = {
  data: CheckoutPoint[];
  height?: number;
};

export function LibraryCheckoutsChart({ data, height = 220 }: Props) {
  const peak = Math.max(...data.map((d) => d.checkouts), 1);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center gap-2 mb-3">
        <span className="rounded-lg bg-amber-50 text-amber-600 p-1.5 ring-1 ring-amber-100">
          <BookOpen size={16} />
        </span>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Library Checkouts</h3>
          <p className="text-[11px] text-slate-500">Books issued, Jan – Jun</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [`${value} checkouts`, "Issued"]}
            cursor={{ fill: "#f8fafc" }}
          />
          <Bar dataKey="checkouts" radius={[6, 6, 0, 0]} maxBarSize={42}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.checkouts === peak ? "#f59e0b" : "url(#barGrad)"} />
            ))}
          </Bar>
        </BarChart>
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
