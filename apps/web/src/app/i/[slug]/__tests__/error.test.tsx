// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InvitationError from "../error";

/**
 * Next only wires this component up as a route-level error boundary at
 * runtime (App Router convention — no test harness for that without a real
 * Next server), so this just verifies the component's own contract: given
 * the `{ error, reset }` props Next guarantees to pass it, it renders the
 * Vietnamese fallback instead of the section that threw, and "Thử lại"
 * calls `reset`. The actual containment (a throw in one section not taking
 * down the rest of the page) was verified manually against the running dev
 * server rather than in an automated test — see the fix report.
 */
describe("InvitationError", () => {
  it("renders a graceful Vietnamese fallback instead of the failed page", () => {
    render(<InvitationError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText("Đã có lỗi khi hiển thị thiệp.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });

  it("calls reset() when 'Thử lại' is clicked", () => {
    const reset = vi.fn();
    render(<InvitationError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
