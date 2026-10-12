"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  axisTick,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
  useIsMounted,
} from "@/components/charts/chart-theme";

interface DataItem {
  [key: string]: string | number;
}

interface MeasuredBarChartProps {
  data: DataItem[];
  xKey: string;
  bars: { key: string; name: string; color: string }[];
  className?: string;
  height?: number;
}

/**
 * Same instrument as `components/charts/bar-chart.tsx`, but with recharts
 * animation gated on `useReducedMotion()` — matching the pattern the line chart
 * already follows. recharts animates on its own clock, so `MotionConfig
 * reducedMotion="user"` never reaches it and `isAnimationActive` must be set
 * explicitly.
 */
export function MeasuredBarChart({ data, xKey, bars, className, height = 300 }: MeasuredBarChartProps) {
  const gradientRoot = useId().replace(/:/g, "");
  const mounted = useIsMounted();
  const reduce = useReducedMotion();

  if (!mounted) {
    return <Skeleton className={cn("w-full", className)} style={{ height }} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height} className={cn(className)}>
      <BarChart data={data}>
        <defs>
          {bars.map((bar) => (
            <linearGradient
              key={bar.key}
              id={`mbar-${gradientRoot}-${bar.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={bar.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={bar.color} stopOpacity={0.3} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey={xKey}
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          padding={{ left: 10, right: 10 }}
        />
        <YAxis axisLine={false} tickLine={false} tick={axisTick} tickCount={5} width={34} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ fill: "rgb(var(--color-primary) / 0.06)" }}
        />
        <Legend wrapperStyle={{ color: "rgb(var(--color-secondary-text))", fontSize: "11px" }} />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={`url(#mbar-${gradientRoot}-${bar.key})`}
            radius={[4, 4, 0, 0]}
            barSize={20}
            isAnimationActive={!reduce}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
