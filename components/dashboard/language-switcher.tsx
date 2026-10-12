"use client";

/**
 * Header language control.
 *
 * Renders only what the server says it can actually translate, so the app
 * cannot offer a language it would then fail to deliver. When the backend has
 * no BHASHINI key configured, the control explains that rather than showing a
 * dropdown of options that all error.
 */
import { useId } from "react";

import { Select } from "@/components/ui/select";
import { Globe } from "@/components/icons";
import { SOURCE_LOCALE, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Endonym, so a reader who speaks the language recognises it without English. */
const NATIVE_NAMES: Record<string, string> = {
  hi: "हिन्दी",
  ta: "தமிழ்",
  bn: "বাংলা",
  ml: "മലയാളം",
  kn: "ಕನ್ನಡ",
  te: "తెలుగు",
  mr: "मराठी",
  gu: "ગુજરાતી",
  pa: "ਪੰਜਾਬੀ",
  or: "ଓଡ଼ିଆ",
  as: "অসমীয়া",
  ur: "اردو",
};

const STATUS_LABEL: Record<string, string> = {
  loading: "translating…",
  ready: "translated",
  cached: "from local cache",
  unavailable: "not configured",
  source: "",
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, available, status, setLocale } = useI18n();
  const id = useId();

  // Nothing to offer until the server answers. Showing a control that cannot
  // work is worse than showing none.
  if (!available || !available.configured || available.targets.length === 0) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <Globe className="h-3.5 w-3.5 text-secondary-text" aria-hidden />
      <label htmlFor={id} className="sr-only">
        Interface language
      </label>
      <Select
        id={id}
        className="h-7 w-[7.5rem] text-xs"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        <option value={SOURCE_LOCALE}>English</option>
        {available.targets.map((target) => (
          <option key={target} value={target}>
            {NATIVE_NAMES[target] ?? target}
          </option>
        ))}
      </Select>
      {/* Names the machine model rather than implying a person or a language
          model produced these strings. */}
      {status !== "source" && (
        <span
          className={cn(
            "telemetry hidden text-[10px] sm:inline",
            status === "unavailable" ? "text-warning" : "text-secondary-text",
          )}
          title={`Machine translation via ${available.model}`}
        >
          {STATUS_LABEL[status]}
        </span>
      )}
    </div>
  );
}
