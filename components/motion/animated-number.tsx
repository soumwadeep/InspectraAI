"use client";

import { useEffect } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform, motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  /** Digits after the decimal point. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Springs a metric to its new value instead of snapping it.
 *
 * `MotionConfig reducedMotion="user"` does not affect `useSpring`, so this
 * component checks reduced motion itself and renders the final value immediately
 * when asked. Text is always tabular mono, so a changing number never reflows the
 * panel around it.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 260, damping: 30, mass: 0.6 });
  const text = useTransform(spring, (latest) => `${prefix}${latest.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, spring, reduce]);

  return (
    <motion.span
      className={className}
      aria-label={`${prefix}${value.toFixed(decimals)}${suffix}`}
    >
      {text}
    </motion.span>
  );
}
