import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "online" | "offline" | "processing" | "warning" | "idle";
  size?: "sm" | "md" | "lg";
  showPulse?: boolean;
}

export const StatusDot = ({ status, size = "md", showPulse = false }: StatusDotProps) => {
  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  const colorClasses = {
    online: "bg-success",
    offline: "bg-secondary-text",
    processing: "bg-primary",
    warning: "bg-warning",
    idle: "bg-secondary-text",
  };

  return (
    <span className="relative flex items-center justify-center">
      <span
        className={cn(
          "rounded-full",
          sizeClasses[size],
          colorClasses[status],
          showPulse && status === "online" && "animate-pulse-glow",
          showPulse && status === "processing" && "absolute h-3 w-3 animate-ping rounded-full opacity-75",
        )}
      />
      {showPulse &&
        (status === "online" || status === "processing") && (
          <span
            className={cn(
              "absolute rounded-full opacity-30",
              sizeClasses[size],
              colorClasses[status],
              status === "processing" ? "animate-pulse" : "",
            )}
          />
        )}
    </span>
  );
};
