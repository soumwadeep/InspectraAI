"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

interface LineChartProps {
  data: DataItem[];
  xKey: string;
  lines: {
    key: string;
    name: string;
    color: string;
  }[];
  className?: string;
  height?: number;
}

export function CustomLineChart({
  data,
  xKey,
  lines,
  className,
  height = 260,
}: LineChartProps) {
  const gradientRoot = useId().replace(/:/g, "");
  const mounted = useIsMounted();
  // recharts animates on its own; MotionConfig does not reach it, so reduced
  // motion has to be honoured here explicitly.
  const reduce = useReducedMotion();

  if (!mounted) {
    return <Skeleton className={cn("w-full", className)} style={{ height }} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height} className={cn(className)}>
      <LineChart data={data}>
        <defs>
          {lines.map((line) => (
            <linearGradient
              key={line.key}
              id={`line-${gradientRoot}-${line.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={line.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0.4} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisTick} />
        <YAxis axisLine={false} tickLine={false} tick={axisTick} width={34} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ stroke: gridStroke, strokeWidth: 1 }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={`url(#line-${gradientRoot}-${line.key})`}
            strokeWidth={2}
            dot={{ r: 2, fill: line.color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: line.color }}
            isAnimationActive={!reduce}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
