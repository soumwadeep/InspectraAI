"use client";

import { useId } from "react";
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
} from "./chart-theme";

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
  height?: number;
}

export function CustomBarChart({
  data,
  xKey,
  bars,
  className,
  height = 300,
}: BarChartProps) {
  const gradientRoot = useId().replace(/:/g, "");
  const mounted = useIsMounted();

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
              id={`grad-${gradientRoot}-${bar.key}`}
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
        <YAxis axisLine={false} tickLine={false} tick={axisTick} tickCount={5} width={34} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ fill: "rgb(var(--color-primary) / 0.06)" }}
        />
        <Legend
          wrapperStyle={{ color: "rgb(var(--color-secondary-text))", fontSize: "11px" }}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={`url(#grad-${gradientRoot}-${bar.key})`}
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
