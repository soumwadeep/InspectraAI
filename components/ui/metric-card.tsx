"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { TrendingUp, TrendingDown, Minus } from "@/components/icons";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

/**
 * A single instrument readout.
 *
 * Numeric values spring to their new value through AnimatedNumber, which renders
 * instantly under reduced motion. Strings are shown verbatim — this page shows
 * things like "No runs yet", and animating a placeholder toward a real number
 * would imply a measurement that has not happened.
 */
export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ title, value, change, trend = "neutral", icon, subtitle, className }, ref) => {
    const TrendIcon =
      trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
    const trendColor =
      trend === "up"
        ? "text-success"
        : trend === "down"
          ? "text-critical-text"
          : "text-secondary-text";

    return (
      <Card
        ref={ref}
        className={cn(
          "group relative overflow-hidden transition-colors duration-300 hover:border-border-hover",
          className,
        )}
      >
        {/* Sweep only lights up on hover, so the panel never animates while idle. */}
        <span
          aria-hidden
          className="scan-layer pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-safe:group-hover:animate-sweep-x"
        />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-kicker font-medium uppercase text-secondary-text">
            {title}
          </CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="font-display text-3xl font-bold text-primary-text tabular-nums">
            {typeof value === "number" ? (
              <AnimatedNumber value={value} />
            ) : (
              value
            )}
          </div>
          {change && (
            <div className="mt-1 flex items-center gap-1 text-xs">
              <TrendIcon className={cn("h-3 w-3", trendColor)} />
              <span className={trendColor}>{change}</span>
              {subtitle && <span className="text-secondary-text">· {subtitle}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);
MetricCard.displayName = "MetricCard";
