// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardError from "../error";

/**
 * C4: `(dashboard)` (covering `/dashboard`, `/mau-thiep`, `/editor/[id]`)
 * had no route-level error boundary at all — `editor/[id]/page.tsx`
 * deliberately throws on a corrupt document, and production showed a bare
 * framework error page with no way back. Same testing-scope caveat as
 * `app/i/[slug]/error.test.tsx`: Next only wires this up as an error
 * boundary at runtime, so this verifies the component's own contract given
 * the `{ error, reset }` props Next guarantees to pass it.
 */
describe("DashboardError", () => {
  it("renders a graceful Vietnamese fallback instead of the failed page", () => {
    render(<DashboardError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText("Đã có lỗi xảy ra. Vui lòng thử lại.")).toBeInTheDocument();
  });

  it("calls reset() when 'Thử lại' is clicked", () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers a way back to the dashboard that does not depend on the failed route recovering", () => {
    render(<DashboardError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Về trang tổng quan" })).toHaveAttribute("href", "/dashboard");
  });
});
