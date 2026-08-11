"use client";

import { useState, type FormEvent } from "react";
import type { FormField, Section } from "@hpwd/schema";
import { useInviteContext } from "../InviteContext";
import { SectionWrapper } from "./SectionWrapper";

type FieldValue = string | string[] | boolean;
type FormValues = Record<string, FieldValue>;

const RATE_LIMIT_MESSAGE = "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút.";
const GENERIC_ERROR_MESSAGE = "Có lỗi xảy ra, vui lòng thử lại.";
const SUCCESS_MESSAGE = "Cảm ơn bạn đã phản hồi!";
const PREVIEW_NOTE = "Xem trước — biểu mẫu sẽ hoạt động sau khi xuất bản";

const inputClassName =
  "rounded-lg border border-[var(--secondary)] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--primary)] disabled:bg-gray-100";

function emptyValueFor(field: FormField): FieldValue {
  if (field.type === "checkbox") {
    return field.options.length > 0 ? [] : false;
  }
  return "";
}

/**
 * Seeds the form's initial values, auto-filling the *first* `text`-type
 * field with the guest's name (from `InviteContext`, resolved server-side
 * from `?g={token}`) whenever one is known — a small personalization touch
 * for guest-specific links — while leaving it a normal, editable input
 * rather than locking it, since a guest filling this out on someone else's
 * behalf should be free to change it.
 */
function initialValues(fields: FormField[], guestName: string | null): FormValues {
  const values: FormValues = {};
  let guestNameApplied = false;
  for (const field of fields) {
    if (!guestNameApplied && field.type === "text" && guestName) {
      values[field.id] = guestName;
      guestNameApplied = true;
    } else {
      values[field.id] = emptyValueFor(field);
    }
  }
  return values;
}

/** Read at submit time (not at mount) per the brief — a guest link's `?g=` token should still be picked up even if this component rendered before the URL settled. */
function readGuestTokenFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("g") ?? undefined;
}

function FieldLabel({ field }: { field: FormField }) {
  return (
    <span>
      {field.label}
      {field.required ? <span className="text-red-500"> *</span> : null}
    </span>
  );
}

function FormFieldInput({
  field,
  value,
  disabled,
  onChange,
  onToggleCheckboxOption,
}: {
  field: FormField;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue) => void;
  onToggleCheckboxOption: (option: string, checked: boolean) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <FieldLabel field={field} />
          <input
            type="text"
            required={field.required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
          />
        </label>
      );

    case "textarea":
      return (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <FieldLabel field={field} />
          <textarea
            required={field.required}
            disabled={disabled}
            rows={3}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={`resize-none ${inputClassName}`}
          />
        </label>
      );

    case "number":
      return (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <FieldLabel field={field} />
          <input
            type="number"
            required={field.required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
          />
        </label>
      );

    case "date":
      return (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <FieldLabel field={field} />
          <input
            type="date"
            required={field.required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
          />
        </label>
      );

    case "select":
      return (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <FieldLabel field={field} />
          <select
            required={field.required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
          >
            <option value="">-- Chọn --</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );

    case "radio":
      return (
        <fieldset className="flex flex-col gap-1.5 text-sm text-gray-700">
          <legend>
            <FieldLabel field={field} />
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={field.id}
                  required={field.required}
                  disabled={disabled}
                  checked={value === option}
                  onChange={() => onChange(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      );

    case "checkbox": {
      if (field.options.length > 0) {
        const selected = Array.isArray(value) ? value : [];
        return (
          <fieldset className="flex flex-col gap-1.5 text-sm text-gray-700">
            <legend>
              <FieldLabel field={field} />
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {field.options.map((option) => (
                <label key={option} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected.includes(option)}
                    onChange={(event) => onToggleCheckboxOption(option, event.target.checked)}
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        );
      }
      return (
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            required={field.required}
            disabled={disabled}
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <FieldLabel field={field} />
        </label>
      );
    }

    default: {
      const exhaustive: never = field.type;
      throw new Error(`Unknown form field type: ${exhaustive as string}`);
    }
  }
}

/**
 * Schema-driven form (RSVP by default, but any `fields` from `FormProps`):
 * one input per declared field, generically rendered by type. `slug` (from
 * `InviteContext`) is `null` in the editor's preview, same as
 * `WishesSection` — there's no published invitation to submit against yet,
 * so the form renders disabled with an explanatory note instead of hitting
 * the API.
 */
export function FormSection({ section }: { section: Extract<Section, { type: "form" }> }) {
  const { title, fields, submitLabel } = section.props;
  const { slug, guestName } = useInviteContext();
  const formDisabled = !slug;

  const [values, setValues] = useState<FormValues>(() => initialValues(fields, guestName));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function setValue(id: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckboxOption(id: string, option: string, checked: boolean) {
    setValues((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = checked ? [...current, option] : current.filter((item) => item !== option);
      return { ...prev, [id]: next };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/invites/${slug}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          data: values,
          guestToken: readGuestTokenFromLocation(),
        }),
      });

      if (res.status === 201) {
        setIsSubmitted(true);
        return;
      }
      if (res.status === 429) {
        setErrorMessage(RATE_LIMIT_MESSAGE);
        return;
      }
      if (res.status === 400) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? GENERIC_ERROR_MESSAGE);
        return;
      }
      setErrorMessage(GENERIC_ERROR_MESSAGE);
    } catch {
      setErrorMessage(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <SectionWrapper section={section} className="flex flex-col items-center gap-4">
        <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">{title}</h2>
        <p role="status" className="text-center text-sm text-green-600">
          {SUCCESS_MESSAGE}
        </p>
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">{title}</h2>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        {formDisabled ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">{PREVIEW_NOTE}</p>
        ) : null}

        {fields.map((field) => (
          <FormFieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            disabled={formDisabled || isSubmitting}
            onChange={(value) => setValue(field.id, value)}
            onToggleCheckboxOption={(option, checked) => toggleCheckboxOption(field.id, option, checked)}
          />
        ))}

        <button
          type="submit"
          disabled={formDisabled || isSubmitting}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? "Đang gửi..." : submitLabel}
        </button>

        {errorMessage ? (
          <p role="status" className="text-center text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </SectionWrapper>
  );
}
