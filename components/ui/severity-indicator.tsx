import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const severityIndicatorVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
  {
    variants: {
      severity: {
        critical: "bg-critical/10 text-critical border border-critical/30",
        warning: "bg-warning/10 text-warning border border-warning/30",
        info: "bg-info/10 text-primary border border-primary/30",
        success: "bg-success/10 text-success border border-success/30",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      severity: "info",
      size: "md",
    },
  }
);

export type SeverityIndicatorProps = VariantProps<typeof severityIndicatorVariants>;

export const SeverityIndicator = ({ severity, size }: SeverityIndicatorProps) => {
  const dotColor = {
    critical: "bg-critical",
    warning: "bg-warning",
    info: "bg-primary",
    success: "bg-success",
  }[severity || "info"];

  return (
    <span className={severityIndicatorVariants({ severity, size })}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      <span className="capitalize">{severity}</span>
    </span>
  );
};
