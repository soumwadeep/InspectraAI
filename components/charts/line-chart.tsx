"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts-wrapper";
import { cn } from "@/lib/utils";

interface DataItem {
  [key: string]: string | number;
}

interface LineChartProps {
  data: DataItem[];
  xKey: string;
  lines: {
    key: string;
    name: string;
    color: string;
  }[];
  className?: string;
}

export function CustomLineChart({ data, xKey, lines, className }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260} className={cn("", className)}>
      <LineChart data={data}>
        <defs>
          {lines.map((line) => (
            <linearGradient
              key={line.key}
              id={`line-${line.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={line.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0.1} />
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
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--secondary-text)", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(17, 24, 40, 0.9)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
          itemStyle={{ color: "var(--primary-text)", fontSize: "12px" }}
          labelStyle={{ color: "var(--secondary-text)", fontSize: "12px" }}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={`url(#line-${line.key})`}
            strokeWidth={2}
            dot={{ r: 3, fill: line.color }}
            activeDot={{ r: 5, fill: line.color }}
            isAnimationActive={true}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
