"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-background hover:bg-primary/90 shadow-lg hover:shadow-cyan/30 glow-cyan",
        destructive:
          "bg-critical text-primary-text hover:bg-critical/90 shadow-lg hover:shadow-red-500/30",
        outline:
          "border border-border bg-surface/50 hover:bg-surface/80 hover:border-border-hover",
        ghost: "hover:bg-surface/50 hover:text-primary-text",
        "ghost-cyan":
          "hover:bg-primary/10 hover:text-primary text-secondary-text",
        secondary:
          "bg-secondary text-background hover:bg-secondary/90 shadow-md hover:shadow-cyan/30",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-12 rounded-lg px-6 text-sm",
        lg: "h-14 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
