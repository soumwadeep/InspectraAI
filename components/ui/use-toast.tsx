"use client";

import { toast as sonnerToast } from "sonner";

type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

let toastFn = sonnerToast;

export function useToast() {
  return {
    toast: ({ title, description, variant }: ToastProps) => {
      const content = (
        <div className="flex flex-col gap-1">
          {title && <span className="font-medium">{title}</span>}
          {description && <span className="text-sm opacity-90">{description}</span>}
        </div>
      );

      if (variant === "destructive") {
        sonnerToast.error(content);
      } else {
        sonnerToast(content);
      }
    },
  };
}
