"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
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
} from "@/components/charts/chart-theme";

interface DataItem {
  name: string;
  value: number;
  color?: string;
}

interface MeasuredPieChartProps {
  data: DataItem[];
  className?: string;
  title?: string;
}

/**
 * Donut counterpart to `components/charts/pie-chart.tsx` with recharts
 * animation gated on reduced motion (`isAnimationActive={!reduce}`), the same
 * pattern `line-chart.tsx` already uses. Colours come from the shared
 `chartSeriesColors` palette so a theme switch does not strand the chart in a
 * different design system.
 */
export function MeasuredPieChart({ data, className, title }: MeasuredPieChartProps) {
  const gradientRoot = useId().replace(/:/g, "");
  const mounted = useIsMounted();
  const reduce = useReducedMotion();

  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || chartSeriesColors[index % chartSeriesColors.length],
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
              id={`mpie-${gradientRoot}-${item.name}`}
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
          isAnimationActive={!reduce}
        >
          {dataWithColors.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={`url(#mpie-${gradientRoot}-${entry.name})`}
              stroke="rgb(var(--color-bg-void))"
              strokeWidth={2}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
