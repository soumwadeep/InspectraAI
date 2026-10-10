"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "@/lib/recharts-wrapper";
import { cn } from "@/lib/utils";

interface DataItem {
  [key: string]: string | number;
}

interface BarChartProps {
  data: DataItem[];
  xKey: string;
  bars: {
    key: string;
    name: string;
    color: string;
  }[];
  className?: string;
}

export function CustomBarChart({ data, xKey, bars, className }: BarChartProps) {
  const colors = {
    cyan: "#38BDF8",
    "cyan-light": "#22D3EE",
    purple: "#A78BFA",
    pink: "#EC4899",
    green: "#10B981",
    orange: "#F59E0B",
    red: "#EF4444",
    yellow: "#FBBF24",
  };

  return (
    <ResponsiveContainer width="100%" height={300} className={cn("", className)}>
      <BarChart data={data}>
        <defs>
          {bars.map((bar) => (
            <linearGradient key={bar.key} id={`grad-${bar.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={bar.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={bar.color} stopOpacity={0.3} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--secondary-text)", fontSize: 12 }}
          padding={{ left: 10, right: 10 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--secondary-text)", fontSize: 12 }}
          tickCount={5}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(17, 24, 40, 0.9)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
          itemStyle={{
            color: "var(--primary-text)",
            fontSize: "12px",
          }}
          labelStyle={{
            color: "var(--secondary-text)",
            fontSize: "12px",
          }}
          cursor={{ fill: "rgba(56, 189, 248, 0.05)" }}
        />
        <Legend
          wrapperStyle={{
            color: "var(--secondary-text)",
            fontSize: "12px",
          }}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={`url(#grad-${bar.key})`}
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
