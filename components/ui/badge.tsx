import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-surface-elevated text-primary-text",
        critical: "bg-critical/10 text-critical border border-critical/30",
        warning: "bg-warning/10 text-warning border border-warning/30",
        success: "bg-success/10 text-success border border-success/30",
        info: "bg-primary/10 text-primary border border-primary/30",
        outline: "border border-border text-secondary-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div className={cn(badgeVariants({ variant }), className)} ref={ref} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
