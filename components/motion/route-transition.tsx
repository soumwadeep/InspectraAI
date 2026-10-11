"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { routeTransition } from "@/lib/motion/presets";

/**
 * Route-level enter/exit choreography for the dashboard shell.
 *
 * `app/dashboard/template.tsx` was considered and rejected: it forces a remount
 * of every page on each navigation, which throws away component state, re-fires
 * every query, and still gives no exit animation. Keying AnimatePresence on the
 * pathname animates both directions while the sidebar and header stay put.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  // `key` is passed as its own attribute, never spread from an object: React 19
  // rejects a key inside a spread props object and logs an error on every render.
  const animation = reduce
    ? {}
    : {
        initial: routeTransition.initial,
        animate: routeTransition.animate,
        exit: routeTransition.exit,
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div key={pathname} {...animation} className="min-h-full">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
