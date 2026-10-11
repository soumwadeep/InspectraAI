"use client";

import { useId } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "@/lib/recharts-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  chartSeriesColors,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
  useIsMounted,
} from "./chart-theme";

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

export function CustomPieChart({ data, className, title }: PieChartProps) {
  // Gradient ids were previously `pie-${item.name}`, so two charts on one page
  // could claim the same id and the second one silently borrowed the first's
  // fill. useId scopes them per component instance.
  const gradientRoot = useId().replace(/:/g, "");
  const mounted = useIsMounted();

  const dataWithColors = data.map((item, i) => ({
    ...item,
    color: item.color || chartSeriesColors[i % chartSeriesColors.length],
  }));

  if (!mounted) {
    return <Skeleton className={cn("h-[240px] w-full", className)} />;
  }

  return (
    <ResponsiveContainer width="100%" height={240} className={cn(className)}>
      <PieChart>
        <defs>
          {dataWithColors.map((item) => (
            <linearGradient
              key={item.name}
              id={`pie-${gradientRoot}-${item.name}`}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.45} />
            </linearGradient>
          ))}
        </defs>
        {title ? <title>{title}</title> : null}
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Pie
          data={dataWithColors}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={78}
          innerRadius={44}
          paddingAngle={2}
          strokeWidth={0}
        >
          {dataWithColors.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={`url(#pie-${gradientRoot}-${entry.name})`}
              stroke="rgb(var(--color-bg-void))"
              strokeWidth={2}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
