import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { DoorOpen } from "lucide-react";

type Props = {
  /** 0-100 percentage of room utilization */
  utilization: number;
  occupiedCount: number;
  totalRooms: number;
  height?: number;
};

export function RoomUtilizationDonut({
  utilization,
  occupiedCount,
  totalRooms,
  height = 220,
}: Props) {
  const data = [
    { name: "Occupied", value: utilization, color: "#0ea5e9" },
    { name: "Free", value: Math.max(0, 100 - utilization), color: "#e2e8f0" },
  ];

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-lg bg-sky-50 text-sky-600 p-1.5 ring-1 ring-sky-100">
          <DoorOpen size={16} />
        </span>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Room Utilization</h3>
          <p className="text-[11px] text-slate-500">{occupiedCount} of {totalRooms} rooms in use</p>
        </div>
      </div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={82}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive
              animationDuration={800}
            >
              <Cell key="Occupied" fill="#0ea5e9" />
              <Cell key="Free" fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-slate-900 tabular-nums">{utilization}%</span>
          <span className="text-[11px] text-slate-500">occupied</span>
        </div>
      </div>
    </div>
  );
}
