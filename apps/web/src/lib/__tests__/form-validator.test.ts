import type { FormField } from "@hpwd/schema";
import { describe, expect, it } from "vitest";
import { buildFormSchema } from "../form-validator";

function field(overrides: Partial<FormField> & Pick<FormField, "id" | "type">): FormField {
  return {
    label: "Field",
    required: false,
    options: [],
    ...overrides,
  };
}

describe("buildFormSchema — text/textarea", () => {
  it("accepts a non-empty string for a required text field", () => {
    const schema = buildFormSchema([field({ id: "name", type: "text", required: true })]);
    const result = schema.safeParse({ name: "Nguyễn Văn A" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Nguyễn Văn A");
  });

  it("rejects a missing required text field", () => {
    const schema = buildFormSchema([field({ id: "name", type: "text", required: true })]);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty/whitespace-only value for a required text field", () => {
    const schema = buildFormSchema([field({ id: "name", type: "text", required: true })]);
    expect(schema.safeParse({ name: "" }).success).toBe(false);
    expect(schema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("allows an optional text field to be absent or empty", () => {
    const schema = buildFormSchema([field({ id: "note", type: "textarea", required: false })]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ note: "" }).success).toBe(true);
    expect(schema.safeParse({ note: "hi" }).success).toBe(true);
  });

  it("rejects a text value over 1000 characters", () => {
    const schema = buildFormSchema([field({ id: "note", type: "textarea", required: false })]);
    expect(schema.safeParse({ note: "x".repeat(1001) }).success).toBe(false);
    expect(schema.safeParse({ note: "x".repeat(1000) }).success).toBe(true);
  });
});

describe("buildFormSchema — number", () => {
  it("coerces a numeric string and validates range", () => {
    const schema = buildFormSchema([field({ id: "count", type: "number", required: true })]);
    const result = schema.safeParse({ count: "3" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.count).toBe(3);
  });

  it("accepts 0 for a required number field (0 is not 'empty')", () => {
    const schema = buildFormSchema([field({ id: "count", type: "number", required: true })]);
    expect(schema.safeParse({ count: 0 }).success).toBe(true);
  });

  it("rejects a missing required number field", () => {
    const schema = buildFormSchema([field({ id: "count", type: "number", required: true })]);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ count: "" }).success).toBe(false);
  });

  it("allows an optional number field to be absent", () => {
    const schema = buildFormSchema([field({ id: "count", type: "number", required: false })]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ count: "" }).success).toBe(true);
  });

  it("rejects a negative, non-integer, or out-of-range number", () => {
    const schema = buildFormSchema([field({ id: "count", type: "number", required: false })]);
    expect(schema.safeParse({ count: -1 }).success).toBe(false);
    expect(schema.safeParse({ count: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ count: 1001 }).success).toBe(false);
    expect(schema.safeParse({ count: 1000 }).success).toBe(true);
  });
});

describe("buildFormSchema — date", () => {
  it("accepts an ISO yyyy-mm-dd date string", () => {
    const schema = buildFormSchema([field({ id: "day", type: "date", required: true })]);
    expect(schema.safeParse({ day: "2026-12-20" }).success).toBe(true);
  });

  it("rejects a malformed date string", () => {
    const schema = buildFormSchema([field({ id: "day", type: "date", required: true })]);
    expect(schema.safeParse({ day: "20/12/2026" }).success).toBe(false);
    expect(schema.safeParse({ day: "not-a-date" }).success).toBe(false);
  });

  it("allows an optional date field to be absent", () => {
    const schema = buildFormSchema([field({ id: "day", type: "date", required: false })]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe("buildFormSchema — select/radio", () => {
  it("accepts a value that is one of the declared options", () => {
    const schema = buildFormSchema([
      field({ id: "attend", type: "radio", required: true, options: ["Có", "Không", "Chưa chắc"] }),
    ]);
    expect(schema.safeParse({ attend: "Có" }).success).toBe(true);
  });

  it("rejects a value that is not one of the declared options", () => {
    const schema = buildFormSchema([
      field({ id: "attend", type: "radio", required: true, options: ["Có", "Không", "Chưa chắc"] }),
    ]);
    expect(schema.safeParse({ attend: "Có lẽ" }).success).toBe(false);
  });

  it("rejects a missing required radio field", () => {
    const schema = buildFormSchema([
      field({ id: "attend", type: "radio", required: true, options: ["Có", "Không"] }),
    ]);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("allows an optional select field to be absent", () => {
    const schema = buildFormSchema([
      field({ id: "color", type: "select", required: false, options: ["Đỏ", "Xanh"] }),
    ]);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("falls back to a free-form string when no options are declared", () => {
    const schema = buildFormSchema([field({ id: "other", type: "select", required: true, options: [] })]);
    expect(schema.safeParse({ other: "anything" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("buildFormSchema — checkbox", () => {
  it("accepts an array of declared options for a checkbox-with-options field", () => {
    const schema = buildFormSchema([
      field({ id: "diet", type: "checkbox", required: false, options: ["Chay", "Hải sản"] }),
    ]);
    expect(schema.safeParse({ diet: ["Chay"] }).success).toBe(true);
    expect(schema.safeParse({ diet: ["Chay", "Hải sản"] }).success).toBe(true);
  });

  it("rejects a checkbox value not present in the declared options", () => {
    const schema = buildFormSchema([
      field({ id: "diet", type: "checkbox", required: false, options: ["Chay", "Hải sản"] }),
    ]);
    expect(schema.safeParse({ diet: ["Mặn"] }).success).toBe(false);
  });

  it("requires at least one selection for a required checkbox-with-options field", () => {
    const schema = buildFormSchema([
      field({ id: "diet", type: "checkbox", required: true, options: ["Chay", "Hải sản"] }),
    ]);
    expect(schema.safeParse({ diet: [] }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ diet: ["Chay"] }).success).toBe(true);
  });

  it("allows an optional checkbox-with-options field to be absent or empty", () => {
    const schema = buildFormSchema([
      field({ id: "diet", type: "checkbox", required: false, options: ["Chay", "Hải sản"] }),
    ]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ diet: [] }).success).toBe(true);
  });

  it("treats a checkbox with no options as a boolean", () => {
    const schema = buildFormSchema([field({ id: "agree", type: "checkbox", required: false, options: [] })]);
    expect(schema.safeParse({ agree: true }).success).toBe(true);
    expect(schema.safeParse({ agree: false }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("requires the boolean checkbox key to be present when required", () => {
    const schema = buildFormSchema([field({ id: "agree", type: "checkbox", required: true, options: [] })]);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ agree: false }).success).toBe(true);
    expect(schema.safeParse({ agree: true }).success).toBe(true);
  });
});

describe("buildFormSchema — strictness", () => {
  it("rejects a key not declared as a field on the section (undeclared field)", () => {
    const schema = buildFormSchema([field({ id: "name", type: "text", required: true })]);
    expect(schema.safeParse({ name: "A", extra: "not declared" }).success).toBe(false);
  });

  it("validates the full seeded RSVP form's fields together", () => {
    const schema = buildFormSchema([
      field({ id: "name", type: "text", required: true, label: "Tên" }),
      field({ id: "guests", type: "number", required: false, label: "Số người đi cùng" }),
      field({
        id: "attend",
        type: "radio",
        required: true,
        label: "Tham dự",
        options: ["Có", "Không", "Chưa chắc"],
      }),
      field({ id: "message", type: "textarea", required: false, label: "Lời nhắn" }),
    ]);

    expect(
      schema.safeParse({ name: "Nguyễn Văn A", guests: "2", attend: "Có", message: "Chúc mừng!" }).success,
    ).toBe(true);
    expect(schema.safeParse({ name: "Nguyễn Văn A", attend: "Có" }).success).toBe(true);
    expect(schema.safeParse({ guests: "2", attend: "Có" }).success).toBe(false); // missing required name
    expect(schema.safeParse({ name: "A", attend: "Có thể" }).success).toBe(false); // bad enum
  });
});
