import type { FormField } from "@hpwd/schema";
import { z } from "zod";

const TEXT_MAX_LENGTH = 1000;
const NUMBER_MIN = 0;
const NUMBER_MAX = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes "nothing meaningfully provided" down to `undefined` before a
 * field's core type schema ever sees it: an empty/whitespace-only string
 * (a blank text input, a number input left empty) or an empty array (no
 * checkbox options ticked). Booleans, real numbers (including `0`), and
 * non-empty strings/arrays pass through untouched — `0` and `false` are
 * valid values, not "empty" ones.
 *
 * Wrapping every field schema in this (via `z.preprocess`) is what makes a
 * single code path handle both "required" and "optional" correctly: a
 * required field's core schema has no `.optional()`, so once this reduces a
 * blank submission down to `undefined` the core schema simply rejects it
 * (an `invalid_type` issue) — no separate "is it empty" check needed. An
 * optional field's core schema is `.optional()`, so the same `undefined`
 * sails through.
 */
function emptyToUndefined(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

/**
 * Guards the `number` field type against type confusion. `z.coerce.number()`
 * runs everything through `Number(...)`, which happily turns `true` into
 * `1`, `[5]` into `5`, and `[]` into `0` — none of those are "a number was
 * submitted", they're a different type that happens to coerce cleanly.
 *
 * Only two shapes are accepted here: a genuine JS `number`, or a string
 * that is *entirely* an optionally-negative run of digits (so `"5.5"` and
 * `"5abc"` are rejected, not silently truncated/parsed). Anything else is
 * passed through UNCHANGED so the `z.number()...` schema that follows
 * rejects it itself with a normal `invalid_type` issue — this function
 * only ever narrows what counts as "a number", it never coerces a
 * non-numeric shape into one.
 */
const INTEGER_STRING_RE = /^-?\d+$/;
function toNumberOrPassthrough(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && INTEGER_STRING_RE.test(value)) return Number(value);
  return value;
}

/**
 * The "core" schema for a field's type — always built as if the field were
 * required (no `.optional()` anywhere). `buildFieldSchema` below is what
 * adds `.optional()` for non-required fields and wraps everything in the
 * `emptyToUndefined` preprocessing described above.
 */
function coreSchemaFor(field: FormField): z.ZodTypeAny {
  switch (field.type) {
    case "text":
    case "textarea":
      // `.trim()` doubles as the transform that produces the trimmed value
      // callers should store, and (combined with `emptyToUndefined` above)
      // means a whitespace-only submission is treated as absent rather than
      // passing a length check on its untrimmed length.
      return z.string().trim().max(TEXT_MAX_LENGTH);

    case "number":
      // `.finite()` explicitly rejects `Infinity`/`-Infinity`/`NaN` — all of
      // which are, per `typeof`, real JS "number"s that `toNumberOrPassthrough`
      // above lets straight through — regardless of whatever `.int()` alone
      // would or wouldn't catch.
      return z.preprocess(
        toNumberOrPassthrough,
        z.number().finite().int().min(NUMBER_MIN).max(NUMBER_MAX),
      );

    case "date":
      return z.string().regex(DATE_RE);

    case "select":
    case "radio":
      // An owner-configured field with no options declared can never
      // validate meaningfully against an enum (zod rejects an empty-tuple
      // enum outright) — fall back to accepting any reasonably-short
      // string rather than making the field impossible to ever submit.
      return field.options.length > 0
        ? z.enum(field.options as [string, ...string[]])
        : z.string().max(200);

    case "checkbox":
      // Only a checkbox with declared options is a multi-select (array of
      // strings); a bare "single checkbox" field (no options — e.g. an
      // "I agree" toggle) is a plain boolean.
      return field.options.length > 0
        ? z.array(z.enum(field.options as [string, ...string[]]))
        : z.boolean();

    default: {
      const exhaustive: never = field.type;
      throw new Error(`Unknown form field type: ${exhaustive as string}`);
    }
  }
}

function buildFieldSchema(field: FormField): z.ZodTypeAny {
  let schema = coreSchemaFor(field);

  if (field.type === "checkbox") {
    if (field.options.length > 0) {
      if (field.required) {
        schema = (schema as z.ZodArray<z.ZodTypeAny>).min(1);
      }
    } else if (field.required) {
      // A bare boolean checkbox (no options — e.g. "I agree"): "required"
      // must mean it was actually checked, not merely that the key is
      // present. `z.boolean()` (from `coreSchemaFor`) would happily accept
      // `{ agree: false }`, which isn't "required" in any meaningful sense
      // — swap in `z.literal(true)` so an unchecked box is rejected.
      schema = z.literal(true);
    }
  }

  if (!field.required) {
    schema = schema.optional();
  }

  return z.preprocess(emptyToUndefined, schema);
}

/**
 * Builds a Zod validator for one `form` section's submission `data`,
 * dynamically, from that section's own `fields` — the shape is never
 * trusted from the client, only from the section definition read out of
 * the invitation's *published* document (see the submissions route).
 *
 * `.strict()` means a key that isn't one of this section's declared
 * field ids is a validation error (`unrecognized_keys`), not silently
 * dropped — the route maps that straight to a 400.
 */
export function buildFormSchema(fields: FormField[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.id] = buildFieldSchema(field);
  }
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, unknown>>;
}
