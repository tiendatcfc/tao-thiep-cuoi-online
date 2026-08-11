import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Section } from "@hpwd/schema";

type AnimationConfig = Section["animation"];

interface AnimatedSectionProps {
  animation: AnimationConfig;
  children: ReactNode;
}

/**
 * Wraps children with scroll-triggered animations (framer-motion's `whileInView`).
 * Respects `prefers-reduced-motion` and handles null children cleanly.
 *
 * - `preset: 'none'`: renders children as-is (plain fragment)
 * - `preset: 'fade'`: opacity 0→1
 * - `preset: 'slide-up'`: {opacity: 0, y: 40}→{opacity: 1, y: 0}
 * - `preset: 'zoom'`: {opacity: 0, scale: 0.92}→{opacity: 1, scale: 1}
 *
 * `prefers-reduced-motion` always renders children without a motion wrapper.
 */
export function AnimatedSection({ animation, children }: AnimatedSectionProps) {
  const shouldReduceMotion = useReducedMotion();

  // If children is null/false, return null (don't create an empty wrapper)
  if (!children) {
    return null;
  }

  // If motion is disabled or preset is 'none', render children without wrapper
  if (shouldReduceMotion || animation.preset === "none") {
    return <>{children}</>;
  }

  const durationSeconds = animation.durationMs / 1000;

  const animationVariants = {
    fade: {
      initial: { opacity: 0 },
      whileInView: { opacity: 1 },
    },
    "slide-up": {
      initial: { opacity: 0, y: 40 },
      whileInView: { opacity: 1, y: 0 },
    },
    zoom: {
      initial: { opacity: 0, scale: 0.92 },
      whileInView: { opacity: 1, scale: 1 },
    },
  };

  const variant = animationVariants[animation.preset];

  return (
    <motion.div
      data-animate={animation.preset}
      initial={variant.initial}
      whileInView={variant.whileInView}
      transition={{
        duration: durationSeconds,
        ease: "easeOut",
      }}
      viewport={{
        once: true,
        margin: "-15%",
      }}
    >
      {children}
    </motion.div>
  );
}
