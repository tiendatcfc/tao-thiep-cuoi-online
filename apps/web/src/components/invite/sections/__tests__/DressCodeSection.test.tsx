// @vitest-environment jsdom
import { createSection } from "@hpwd/schema";
import type { Section } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DressCodeSection } from "../DressCodeSection";

function section(props: Partial<Extract<Section, { type: "dresscode" }>["props"]> = {}) {
  const base = createSection("dresscode") as Extract<Section, { type: "dresscode" }>;
  base.props = { ...base.props, ...props };
  return base;
}

describe("DressCodeSection", () => {
  it("paints one swatch per colour and names it for a screen reader", () => {
    // The colour is the content here — the section deliberately prints no
    // colour NAMES, because "đỏ mận" means a different shade to everyone.
    // That makes the accessible name the only way a guest using a screen
    // reader gets the information at all.
    const { container } = render(<DressCodeSection section={section({ colors: ["#5E1224", "#C9A227"] })} />);

    const swatches = [...container.querySelectorAll("li > span[title]")];
    expect(swatches).toHaveLength(2);
    expect(swatches[0]).toHaveStyle({ backgroundColor: "#5E1224" });
    expect(screen.getByText("#5E1224")).toBeInTheDocument();
    expect(screen.getByText("#C9A227")).toBeInTheDocument();
  });

  it("renders nothing at all when the couple has not chosen any colours", () => {
    // Not an empty heading over empty space: `createSection` ships a title
    // and no colours, which is exactly the state a section is in the
    // moment it is added.
    const { container } = render(<DressCodeSection section={section({ colors: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the note and title optional", () => {
    render(<DressCodeSection section={section({ title: "", note: "", colors: ["#fff"] })} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
