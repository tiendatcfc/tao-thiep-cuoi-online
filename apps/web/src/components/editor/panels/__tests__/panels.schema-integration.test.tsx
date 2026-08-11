// @vitest-environment jsdom
/**
 * Integration test across the real store (not mocked) proving that a
 * realistic sequence of edits, through the actual panel components a
 * couple would use, always leaves `document` passing
 * `InvitationDocumentSchema.parse` — the exact property `useAutosave`
 * depends on before every PATCH (see its own docstring / EditorLayout's
 * "Nội dung chưa hợp lệ" test). Individual panel tests already cover each
 * field in isolation; this is the "do they compose without corrupting the
 * whole document" check.
 */
import { createDefaultDocument, InvitationDocumentSchema, type Section, type SectionType } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { AlbumPanel } from "../AlbumPanel";
import { CoverPanel } from "../CoverPanel";
import { EventsPanel } from "../EventsPanel";
import { FormPanel } from "../FormPanel";
import { GiftPanel } from "../GiftPanel";
import { OpeningPanel } from "../OpeningPanel";
import { StoryPanel } from "../StoryPanel";
import { ThemePanel } from "../ThemePanel";
import { WishesPanel } from "../WishesPanel";

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

function sectionOfType<T extends Section["type"]>(type: T): Extract<Section, { type: T }> {
  const section = useEditorStore.getState().document.sections.find((s) => s.type === type);
  if (!section) throw new Error(`Fixture missing a ${type} section`);
  return section as Extract<Section, { type: T }>;
}

/** Adds a fresh section of `type` (not present in `createDefaultDocument`'s fixture, e.g. `story`) and returns it. */
function addAndGetSection<T extends SectionType>(type: T): Extract<Section, { type: T }> {
  useEditorStore.getState().addSection(type);
  return sectionOfType(type);
}

beforeEach(() => {
  resetStore();
});

describe("panel edits keep the document schema-valid end to end", () => {
  it("survives a realistic multi-panel editing session", () => {
    // Each stage renders exactly one panel at a time (mirroring
    // `EditorPanel`, which only ever mounts the single selected panel) and
    // unmounts it before the next — otherwise every stage's "Thêm" button,
    // shared across several ListField-based panels, would pile up in the
    // DOM at once and make `screen` queries ambiguous.

    // 1. Cover: edit groom/bride names.
    let view = render(<CoverPanel section={sectionOfType("cover")} />);
    fireEvent.change(screen.getByLabelText("Tên chú rể"), { target: { value: "Nguyễn Văn A" } });
    fireEvent.blur(screen.getByLabelText("Tên chú rể"));
    view.unmount();

    // 2. Events: add a third event.
    view = render(<EventsPanel section={sectionOfType("events")} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    view.unmount();

    // 3. Gift: add a third account (exercises GiftPanel's own "+ Thêm" seed
    //    — see the B1 fix in GiftPanel.tsx), then pick a bank and set the
    //    account number on the first (pre-seeded) account too.
    view = render(<GiftPanel section={sectionOfType("gift")} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    view.unmount();
    // Re-render with the fresh (3-account) section from the store before
    // continuing — mirrors `EditorPanel` handing down a fresh `section`
    // prop on every store change, and is exactly the step B1's bug hid
    // behind skipping.
    view = render(<GiftPanel section={sectionOfType("gift")} />);
    const bankInputs = screen.getAllByLabelText("Ngân hàng");
    fireEvent.change(bankInputs[0], { target: { value: "ACB" } });
    fireEvent.click(screen.getAllByRole("option", { name: /ACB/ })[0]);
    const accountNumberInputs = screen.getAllByLabelText("Số tài khoản");
    fireEvent.change(accountNumberInputs[0], { target: { value: "9999888877" } });
    view.unmount();

    // 4. Album: add a placeholder image (schema-valid 1x1 by construction).
    view = render(<AlbumPanel section={sectionOfType("album")} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    view.unmount();

    // 5. Wishes: toggle requireApproval.
    view = render(<WishesPanel section={sectionOfType("wishes")} />);
    fireEvent.click(screen.getByRole("switch", { name: "Duyệt lời chúc trước khi hiển thị" }));
    view.unmount();

    // 6. Form: add a question (exercises FormPanel's own "+ Thêm" seed —
    //    see the B1 fix in FormPanel.tsx). The default document already
    //    seeds a "radio" question with its own nested options ListField, so
    //    there are 2 "Thêm" buttons at this point — the outer
    //    (add-question) one is last in document order.
    view = render(<FormPanel section={sectionOfType("form")} />);
    const addQuestionButtons = screen.getAllByRole("button", { name: "Thêm" });
    fireEvent.click(addQuestionButtons[addQuestionButtons.length - 1]);
    view.unmount();
    // Re-render with a fresh `section` prop BEFORE any further interaction
    // — critically, before changing the newly-added field's type below,
    // which (pre-fix) operated on the stale pre-add `items` array and
    // silently reverted the add entirely (see B1's investigation notes).
    view = render(<FormPanel section={sectionOfType("form")} />);
    const rows = screen.getAllByRole("listitem");
    const newRow = rows[rows.length - 1];
    fireEvent.change(within(newRow).getByLabelText("Loại câu hỏi"), { target: { value: "select" } });
    view.unmount();
    // Re-render again (fresh props) to interact with the now-different
    // (options-bearing) shape.
    view = render(<FormPanel section={sectionOfType("form")} />);
    const formRows = screen.getAllByRole("listitem");
    const selectRow = formRows[formRows.length - 1];
    fireEvent.click(within(selectRow).getAllByRole("button", { name: "Thêm" })[0]);
    view.unmount();

    // 7. Theme: change colors and fonts.
    view = render(<ThemePanel />);
    fireEvent.change(screen.getByLabelText("Font tiêu đề"), { target: { value: "Merriweather" } });
    const primaryHex = screen.getByLabelText("Mã màu Màu chủ đạo");
    fireEvent.change(primaryHex, { target: { value: "#123456" } });
    fireEvent.blur(primaryHex);
    view.unmount();

    // 8. Opening: change effect/particles/monogram.
    view = render(<OpeningPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /Rèm kéo/ }));
    fireEvent.change(screen.getByLabelText("Hiệu ứng hạt"), { target: { value: "confetti" } });
    const monogram = screen.getByLabelText("Monogram");
    fireEvent.change(monogram, { target: { value: "A&B" } });
    fireEvent.blur(monogram);
    view.unmount();

    const finalDocument = useEditorStore.getState().document;

    // The real, load-bearing assertion: still schema-valid after all of
    // the above, composed together.
    expect(() => InvitationDocumentSchema.parse(finalDocument)).not.toThrow();

    // Spot-check a few of the edits actually landed (not just "didn't
    // throw" — a no-op editor would also pass the schema check).
    expect(sectionOfType("cover").props.groomName).toBe("Nguyễn Văn A");
    expect(sectionOfType("events").props.items).toHaveLength(3);
    expect(sectionOfType("gift").props.accounts).toHaveLength(3);
    expect(sectionOfType("gift").props.accounts[0].accountNumber).toBe("9999888877");
    for (const account of sectionOfType("gift").props.accounts) {
      expect(account.bankBin).toMatch(/^\d{4,8}$/);
    }
    expect(sectionOfType("album").props.images).toHaveLength(1);
    expect(sectionOfType("wishes").props.requireApproval).toBe(true);
    // The newly-added (then retyped-to-select) question actually landed,
    // proving the add wasn't silently reverted by the later interaction.
    expect(sectionOfType("form").props.fields).toHaveLength(5);
    expect(sectionOfType("form").props.fields[4].type).toBe("select");
    expect(sectionOfType("form").props.fields[4].options).toHaveLength(1);
    expect(finalDocument.theme.headingFont).toBe("Merriweather");
    expect(finalDocument.theme.primary).toBe("#123456");
    expect(finalDocument.opening.effect).toBe("curtain");
    expect(finalDocument.opening.particles).toBe("confetti");
    expect(finalDocument.opening.monogram).toBe("A&B");
  });
});

/**
 * B1 regression coverage: every panel exposing a `ListField` "+ Thêm"
 * button must leave the document schema-valid THE INSTANT it's clicked,
 * with nothing else touched — this is exactly the couple's real click
 * sequence ("click + Thêm, then get distracted / navigate away" per the
 * finding) and exactly the case `GiftPanel`/`FormPanel` used to fail (empty
 * `bankBin`/`accountNumber`/`label` seeds violating the schema, silently
 * wedging `useAutosave` for the whole document afterwards).
 *
 * Each case re-renders with a fresh `section` prop straight from the store
 * after the click (mirroring `EditorPanel`) BEFORE asserting, so a bug that
 * only hides behind a stale/unrefreshed view (as the Form step above
 * documents) can't slip through here either.
 */
describe("every '+ Thêm' button leaves the document schema-valid", () => {
  it.each<[string, () => void]>([
    [
      "EventsPanel",
      () => {
        const view = render(<EventsPanel section={sectionOfType("events")} />);
        fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
        view.unmount();
      },
    ],
    [
      "AlbumPanel",
      () => {
        const view = render(<AlbumPanel section={sectionOfType("album")} />);
        fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
        view.unmount();
      },
    ],
    [
      "GiftPanel",
      () => {
        const view = render(<GiftPanel section={sectionOfType("gift")} />);
        fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
        view.unmount();
      },
    ],
    [
      "FormPanel",
      () => {
        const view = render(<FormPanel section={sectionOfType("form")} />);
        const buttons = screen.getAllByRole("button", { name: "Thêm" });
        fireEvent.click(buttons[buttons.length - 1]);
        view.unmount();
      },
    ],
    [
      "StoryPanel",
      () => {
        const section = addAndGetSection("story");
        const view = render(<StoryPanel section={section} />);
        fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
        view.unmount();
      },
    ],
  ])("%s: clicking '+ Thêm' alone keeps the document schema-valid", (_name, interact) => {
    interact();

    const document = useEditorStore.getState().document;
    expect(() => InvitationDocumentSchema.parse(document)).not.toThrow();
  });
});
