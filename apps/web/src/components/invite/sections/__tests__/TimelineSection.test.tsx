// @vitest-environment jsdom
import { createSection } from "@hpwd/schema";
import type { Section } from "@hpwd/schema";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineSection } from "../TimelineSection";

function section(items: Extract<Section, { type: "timeline" }>["props"]["items"]) {
  const base = createSection("timeline") as Extract<Section, { type: "timeline" }>;
  base.props = { ...base.props, items };
  return base;
}

describe("TimelineSection", () => {
  it("lists the entries in order, as a real ordered list", () => {
    // `<ol>`, not a stack of divs: the running order of a wedding day IS
    // a sequence, and a screen reader should say "1 of 3".
    render(
      <TimelineSection
        section={section([
        { time: "17:00", label: "Đón khách", icon: "flower" },
        { time: "18:00", label: "Khai tiệc", icon: "toast" },
        { time: "20:30", label: "Kết thúc tiệc", icon: "none" },
        ])}
      />,
    );
    const list = screen.getByRole("list");
    const entries = within(list).getAllByRole("listitem");

    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent("17:00");
    expect(entries[0]).toHaveTextContent("Đón khách");
    expect(entries[2]).toHaveTextContent("Kết thúc tiệc");
  });

  it("draws an icon only where one was chosen, and never for `none`", () => {
    const { container } = render(
      <TimelineSection
        section={section([
        { time: "18:00", label: "Khai tiệc", icon: "toast" },
        { time: "20:30", label: "Kết thúc tiệc", icon: "none" },
        ])}
      />,
    );
    // Counted inside the list, not the whole container: the card hangs a
    // floral ornament, which is also an <svg> and would make this pass for
    // the wrong reason.
    // Two entries, one icon: `none` is a deliberate, common choice rather
    // than a missing value, so it must draw nothing at all.
    expect(container.querySelectorAll("ol svg")).toHaveLength(1);
  });

  it("renders nothing at all when the couple has added no entries", () => {
    const { container } = render(<TimelineSection section={section([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
