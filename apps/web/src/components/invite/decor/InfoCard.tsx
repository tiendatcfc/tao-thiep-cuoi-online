import type { CSSProperties, ReactNode } from "react";
import { Ornament, type OrnamentCorner } from "./Ornament";

/**
 * The filled information card.
 *
 * Before this existed every section sat on the same sheet of paper, so a
 * long invitation scrolled as one undifferentiated column of centred text.
 * The card is the light/dark rhythm that fixes that: the ceremony and the
 * reception details are set in the couple's own `--primary`, everything
 * else stays on paper.
 *
 * Its ink comes from `--on-primary`, which `InvitePage` computes from that
 * same colour with `readableInkOn` — a couple is free to pick a pale blush
 * as their primary, and cream text on blush is invisible. See
 * `lib/contrast.ts`.
 */
export interface InfoCardProps {
  children: ReactNode;
  /**
   * Corners to hang a floral spray on. Two opposite corners is the
   * stationery convention; more starts to look crowded. The default size
   * is tuned against the 342px the card gets inside a 390px phone — at
   * the 132px this started at, the sprays were reaching into the address
   * text on a two-line venue name.
   */
  ornaments?: OrnamentCorner[];
  ornamentSize?: number;
  className?: string;
  style?: CSSProperties;
}

export function InfoCard({
  children,
  ornaments = ["bottom-right"],
  ornamentSize = 104,
  className = "",
  style,
}: InfoCardProps) {
  return (
    <div
      data-info-card
      className={`relative w-full overflow-visible rounded-[var(--radius-card)] px-6 py-10 text-center ${className}`.trim()}
      style={{
        backgroundColor: "var(--primary)",
        color: "var(--on-primary)",
        boxShadow: "var(--shadow-lift)",
        ...style,
      }}
    >
      {/* Ornaments overhang the card edge the way printed stationery does.
          `[data-invite-column]` carries `overflow-x: clip` so a spray on a
          card at the full width of the column can never widen the page. */}
      {ornaments.map((corner) => (
        <Ornament key={corner} corner={corner} size={ornamentSize} opacity={0.9} className="-m-3" />
      ))}
      {/* Above the sprays, always: they are decoration and the couple's
          names are not. */}
      <div className="relative z-10 flex flex-col items-center gap-5">{children}</div>
    </div>
  );
}
