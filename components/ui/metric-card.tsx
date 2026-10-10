import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ title, value, change, trend = "neutral", icon, subtitle, className }, ref) => {
    const TrendIcon =
      trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
    const trendColor =
      trend === "up"
        ? "text-success"
        : trend === "down"
        ? "text-critical"
        : "text-secondary-text";

    return (
      <Card
        ref={ref}
        className={cn(
          "group transition-all duration-300 hover:bg-surface-elevated/80",
          className
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-secondary-text">
            {title}
          </CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary-text">{value}</div>
          {change && (
            <div className="mt-1 flex items-center gap-1 text-xs">
              <TrendIcon className={cn("h-3 w-3", trendColor)} />
              <span className={trendColor}>{change}</span>
              {subtitle && (
                <span className="text-secondary-text">· {subtitle}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
MetricCard.displayName = "MetricCard";
