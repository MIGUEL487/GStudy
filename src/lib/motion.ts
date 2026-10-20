/**
 * Motion design tokens for GStudy (Dark Academia & Editorial).
 * Standardizes durations (150ms, 250ms, 400ms), easing curves, and spring configs.
 */

export const motionTokens = {
  duration: {
    instant: 0.15,
    quick: 0.25,
    smooth: 0.4,
  },
  easing: {
    editorial: [0.22, 1, 0.36, 1] as const,
    spring: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
    },
    bouncy: {
      type: "spring" as const,
      stiffness: 400,
      damping: 25,
    },
  },
} as const;

export const pageTransitionVariants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.15,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const staggerContainerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const cardInteraction = {
  whileHover: {
    y: -3,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
    },
  },
  whileTap: {
    scale: 0.98,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 30,
    },
  },
};
