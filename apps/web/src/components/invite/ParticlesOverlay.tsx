"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export interface ParticlesOverlayProps {
  kind: "petals" | "confetti";
}

const PARTICLE_COUNT = 30;
const PETAL_COLORS = ["#f8c9d8", "#f7b6c9", "#fbdce6", "#f4a6bf", "#f9d5e5"];
const CONFETTI_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc"];

/**
 * The canvas is deliberately ABOVE the invitation content (see the component
 * doc), so an opaque fill paints a solid blob over whatever text it happens to
 * cross — parents' names and venue addresses are the ones that actually got
 * covered. Drawing translucently keeps the drift readable as decoration while
 * the words underneath stay legible. Confetti is smaller and higher-contrast
 * than a petal, so it can afford slightly less transparency.
 */
const PARTICLE_ALPHA: Record<"petals" | "confetti", number> = {
  petals: 0.5,
  confetti: 0.6,
};

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  driftX: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
}

function randomColor(kind: "petals" | "confetti"): string {
  const colors = kind === "petals" ? PETAL_COLORS : CONFETTI_COLORS;
  return colors[Math.floor(Math.random() * colors.length)];
}

function createParticle(kind: "petals" | "confetti", width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height - height,
    size: kind === "petals" ? 6 + Math.random() * 6 : 4 + Math.random() * 4,
    speedY: 0.4 + Math.random() * 1,
    driftX: (Math.random() - 0.5) * 0.6,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
    color: randomColor(kind),
  };
}

function drawParticle(ctx: CanvasRenderingContext2D, kind: "petals" | "confetti", p: Particle) {
  ctx.save();
  ctx.globalAlpha = PARTICLE_ALPHA[kind];
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  if (kind === "petals") {
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
  }
  ctx.restore();
}

/**
 * Full-viewport `<canvas>` overlay drawing ~30 falling particles (soft pink
 * petals or multicolour confetti rectangles) via `requestAnimationFrame`.
 * Fixed, `pointer-events-none`, and `z-40` — below the music player's
 * sticky `z-50` button but above the invitation content, which is why every
 * particle is filled at `PARTICLE_ALPHA` rather than opaque — and `aria-hidden`
 * since it's purely decorative. Only meant to be rendered by `InvitePage`
 * once the opening gate has actually opened, so nothing falls in front of
 * the still-closed envelope/curtain/fade overlay.
 *
 * Renders nothing at all under `prefers-reduced-motion`: per the task's
 * controller resolutions, reduced motion means no particles, not a
 * shortened animation.
 */
export function ParticlesOverlay({ kind }: ParticlesOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom (no `canvas` npm package installed) returns `null` here rather
    // than a real 2D context; the animation loop below still runs and gets
    // cleaned up correctly, it just skips the per-frame drawing.
    const ctx = canvas.getContext("2d");

    let width = window.innerWidth;
    let height = window.innerHeight;
    let particles: Particle[] = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(kind, width, height));
    }
    resize();
    window.addEventListener("resize", resize);

    let frameId = requestAnimationFrame(function tick() {
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        for (const particle of particles) {
          particle.y += particle.speedY;
          particle.x += particle.driftX;
          particle.rotation += particle.rotationSpeed;
          if (particle.y > height + 20) {
            particle.y = -20;
            particle.x = Math.random() * width;
          }
          drawParticle(ctx, kind, particle);
        }
      }
      frameId = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [kind, shouldReduceMotion]);

  if (shouldReduceMotion) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-40" />;
}
