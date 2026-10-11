"use client";

import { motion } from "framer-motion";
import { entry, easing } from "@/lib/motion/presets";

/**
 * Shared backdrop for the sign-in and registration screens.
 *
 * The instrument grid, the corner brackets and the sweep are the only motion
 * here, and none of it claims to be live data: the footer states product
 * identity, not a measurement. Everything animates once on mount and then stops,
 * and the sweep is gated behind `motion-safe`.
 */
export function AuthShell({
  brand,
  children,
  footer,
}: {
  brand: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="grid-overlay pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgb(var(--color-primary) / 0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="scan-layer pointer-events-none absolute inset-x-0 top-0 h-40 motion-safe:animate-scan"
      />

      <div className="relative w-full max-w-md">
        <motion.div
          variants={entry.rise}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.5, ease: easing.outExpo }}
          className="edge-glow relative rounded-2xl p-6 sm:p-8"
        >
          {/* Reticle corners: reads as an instrument frame rather than a card. */}
          {[
            "left-0 top-0 border-l-2 border-t-2 rounded-tl-2xl",
            "right-0 top-0 border-r-2 border-t-2 rounded-tr-2xl",
            "left-0 bottom-0 border-b-2 border-l-2 rounded-bl-2xl",
            "right-0 bottom-0 border-b-2 border-r-2 rounded-br-2xl",
          ].map((position) => (
            <span
              key={position}
              aria-hidden
              className={`absolute h-5 w-5 border-primary/60 ${position}`}
            />
          ))}

          <div className="mb-7">{brand}</div>
          {children}
        </motion.div>

        {footer && (
          <p className="mt-6 text-center text-xs text-secondary-text">{footer}</p>
        )}
      </div>
    </div>
  );
}

/** Brand block used above both forms. */
export function AuthBrand({ headline, caption }: { headline: string; caption: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" opacity="0.55" />
        </svg>
      </div>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold leading-tight text-gradient-hero">
          Inspectra AI
        </h1>
        <p className="text-kicker uppercase text-secondary-text">Vision Command OS</p>
        <p className="mt-1 text-sm text-secondary-text">{headline}</p>
        <p className="text-xs text-secondary-text/80">{caption}</p>
      </div>
    </div>
  );
}
