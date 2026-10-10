"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "@/lib/recharts-wrapper";
import { cn } from "@/lib/utils";

interface DataItem {
  name: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: DataItem[];
  className?: string;
  title?: string;
}

const defaultColors = ["#38BDF8", "#22D3EE", "#A78BFA", "#EC4899", "#10B981", "#F59E0B"];

export function CustomPieChart({ data, className, title }: PieChartProps) {
  const dataWithColors = data.map((item, i) => ({
    ...item,
    color: item.color || defaultColors[i % defaultColors.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={240} className={cn("", className)}>
      <PieChart>
        <defs>
          {dataWithColors.map((item) => (
            <linearGradient key={item.name} id={`pie-${item.name}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.4} />
            </linearGradient>
          ))}
        </defs>
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(17, 24, 40, 0.9)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
          itemStyle={{ color: "var(--primary-text)", fontSize: "12px" }}
          labelStyle={{ color: "var(--secondary-text)", fontSize: "12px" }}
        />
        <Pie
          data={dataWithColors}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={70}
          fill="url(#pie-data)"
          paddingAngle={2}
        >
          {dataWithColors.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              stroke="var(--background)"
              strokeWidth={2}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
