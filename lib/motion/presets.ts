import type { Transition, Variants } from "framer-motion";

/**
 * The single motion vocabulary for the app.
 *
 * Six pages each carried their own copy of the same `container`/`item` stagger
 * object, which meant a change to the choreography had to be made six times and
 * never was. Everything here is expressed in milliseconds and exponential easing
 * so panels feel like instruments rather than like a carousel.
 *
 * Reduced motion: `MotionConfig reducedMotion="user"` (app/providers.tsx) covers
 * these declarative variants. It does **not** affect `useSpring`/`useTransform`,
 * so AnimatedNumber, tilt and any sweep check `useReducedMotion()` themselves.
 */

export const easing = {
  /** Fast out, settle long — the house curve for panels arriving. */
  outExpo: [0.16, 1, 0.3, 1] as const,
  /** Quick departure, used for exits so nothing lingers. */
  inExpo: [0.7, 0, 0.84, 0] as const,
  linear: "linear" as const,
};

export const spring = {
  snappy: { type: "spring", stiffness: 320, damping: 28, mass: 0.7 } satisfies Transition,
  settle: { type: "spring", stiffness: 200, damping: 24, mass: 0.9 } satisfies Transition,
};

export const entry = {
  /** A bay powering on: no travel, just light and a few pixels. */
  boot: {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.28, ease: easing.outExpo },
    },
  },
  rise: {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.42, ease: easing.outExpo },
    },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, transition: { duration: 0.12, ease: easing.inExpo } },
  },
} satisfies Record<string, Variants>;

export const stagger = {
  /** Metric grids, rails and tile groups. */
  rail: {
    hidden: {},
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  },
  /** Agent steps and traces — deliberately slower, so a run reads as sequential. */
  sequence: {
    hidden: {},
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12 },
    },
  },
};

/** A panel sliding open from its own left edge. */
export const panelReveal: Variants = {
  hidden: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  visible: {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.5, ease: easing.outExpo },
  },
};

/**
 * A single horizontal sweep. Use **only while a request is genuinely in flight**
 * — the pipeline is one blocking call with no progress endpoint, so a percentage
 * would be invented, and a sweep that runs while nothing is happening is theatre.
 */
export const scanSweep: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** Telemetry bus: hairlines travelling across a panel, sized by real values. */
export const dataStream: Variants = {
  hidden: { x: "-8%", opacity: 0 },
  visible: {
    x: "108%",
    opacity: 1,
    transition: { duration: 1.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6 },
  },
};

export const pulse = {
  live: {
    scale: [1, 1.12, 1],
    opacity: [0.85, 1, 0.85],
    transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
  },
};

/** Lock-on: the reticle draws itself, then snaps. Stagger by index * 0.07. */
export const reticleLock: Variants = {
  hidden: { opacity: 0, scale: 1.06, pathLength: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    pathLength: 1,
    transition: {
      opacity: { duration: 0.18 },
      scale: { ...spring.snappy },
      pathLength: { duration: 0.3, ease: easing.outExpo },
    },
  },
};

/** Pointer-driven CSS 3D. Amplitudes stay small: depth, not a carousel. */
export const tilt3d = {
  containerStyle: { perspective: 1200 } as React.CSSProperties,
  variants: {
    rest: { rotateX: 0, rotateY: 0, scale: 1, transition: spring.settle },
  } satisfies Record<string, Variants[string]>,
  maxTiltDegrees: 6,
};

export const press = {
  whileHover: { y: -2, transition: { duration: 0.16 } },
  whileTap: { scale: 0.985, transition: { duration: 0.08 } },
};

export const routeTransition = {
  initial: { opacity: 0, y: 8, filter: "blur(3px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.26, ease: easing.outExpo },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(4px)",
    transition: { duration: 0.12, ease: easing.inExpo },
  },
};
