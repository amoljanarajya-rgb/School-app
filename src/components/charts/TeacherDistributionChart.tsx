import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users } from "lucide-react";

export type TeacherSlice = { name: string; value: number; color: string };

type Props = {
  data: TeacherSlice[];
  height?: number;
};

export function TeacherDistributionChart({ data, height = 300 }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">Teacher Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Staff by department</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          <Users size={13} /> {total} staff
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              `${value} staff (${((Number(value) / total) * 100).toFixed(0)}%)`,
              String(name),
            ]}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={9}
            wrapperStyle={{ fontSize: 12, color: "#475569", paddingTop: 8 }}
          />
        </PieChart>
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
