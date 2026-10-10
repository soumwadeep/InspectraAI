import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        className={cn(
          "w-full cursor-pointer appearance-none rounded-lg border bg-surface/50 px-3 py-2 text-sm text-primary-text placeholder:text-secondary-text focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
    </div>
  )
);
Select.displayName = "Select";

const SelectTrigger = Select;
const SelectValue = ({ placeholder }: { placeholder?: string }) => null;
const SelectContent = ({ children }: { children: React.ReactNode }) => children;
const SelectItem = ({ children, ...props }: React.HTMLAttributes<HTMLOptionElement> & { value: string }) => (
  <option {...props}>{children}</option>
);
const SelectLabel = ({ children }: { children: React.ReactNode }) => children;
const SelectSeparator = () => <option disabled hidden>───</option>;

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel, SelectSeparator };
