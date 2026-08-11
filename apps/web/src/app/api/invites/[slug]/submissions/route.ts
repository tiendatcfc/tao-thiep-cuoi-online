import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, type Prisma } from "@hpwd/db";
import { InvitationDocumentSchema, type FormField, type Section } from "@hpwd/schema";
import { getClientIp } from "@/lib/client-ip";
import { buildFormSchema } from "@/lib/form-validator";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";

const SUBMISSION_RATE_LIMIT = { limit: 3, windowSec: 60 };
const NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";
const GENERIC_INVALID_MESSAGE = "Dữ liệu gửi lên không hợp lệ.";

// The envelope's own shape (which section, plus an optional guest token) is
// fixed and known ahead of time; only `data`'s shape depends on the
// section's fields, so it's validated separately below once the section is
// found — this schema just gets far enough to read `sectionId`.
// `guestToken` has no `.min(1)` — an empty string is just another value
// that will never match a real `Guest.token` below, and per the brief a
// bad/foreign token must never fail the request with a 400.
const envelopeSchema = z.object({
  sectionId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  guestToken: z.string().optional(),
});

async function findPublishedInvitation(slug: string) {
  const invitation = await prisma.invitation.findUnique({ where: { slug } });
  if (!invitation || invitation.status !== "published" || !invitation.publishedDocument) {
    return null;
  }
  return invitation;
}

/** The section a submission targets must exist in the *published* document and be a `form` section — a wishes/gift/etc section id, or one from a since-edited draft, is treated the same as "no such section". */
function findFormSection(
  sections: Section[],
  sectionId: string,
): Extract<Section, { type: "form" }> | null {
  const section = sections.find((s) => s.id === sectionId);
  if (!section || section.type !== "form") return null;
  return section;
}

/**
 * Turns the first issue from validating a submission's `data` against the
 * section's dynamically-built schema (`buildFormSchema`) into a Vietnamese
 * message. Traces the issue back to the declaring field's `label` when
 * possible (falling back to the field id, then a generic message) rather
 * than surfacing Zod's own English wording to a guest filling out a form.
 *
 * Distinguishes two genuinely different situations rather than collapsing
 * both into "is required":
 *   - nothing meaningful was provided (missing key, blank/whitespace-only
 *     string, empty array, an unchecked required checkbox) → "là bắt buộc"
 *   - a value WAS supplied but doesn't satisfy the field's rules (out of
 *     range, wrong type, bad enum value) → "không hợp lệ"
 * Conflating these (e.g. a present-but-negative number, or a
 * present-but-boolean `{ count: true }`, reported as "required") would be
 * actively misleading to whoever's filling the form out.
 *
 * Classification reads the RAW submitted `data` at the failing field's key
 * — never `issue.code` alone, and never `issue.input`:
 *   - `issue.input` is stripped off every Zod v4 issue by default (see
 *     `finalizeIssue` in zod's core; nothing here sets `reportInput`), so
 *     any check reading it is dead code that silently never fires.
 *   - `issue.code` alone can't distinguish "the key was never sent" from
 *     "a wrong-shape value was sent" — `buildFormSchema`'s `z.number()`
 *     schema, for instance, reports the exact same `invalid_type` for an
 *     absent `count` key and for `{ count: true }`, and only one of those
 *     is actually "required".
 */
function formatValidationError(
  error: z.ZodError,
  fields: FormField[],
  data: Record<string, unknown>,
): string {
  const issue = error.issues[0];
  if (!issue) return GENERIC_INVALID_MESSAGE;

  // An undeclared key (`.strict()`), or any other whole-object-level issue
  // with no field to point at: stays generic.
  if (issue.code === "unrecognized_keys") {
    return GENERIC_INVALID_MESSAGE;
  }

  const fieldId = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
  if (!fieldId) return GENERIC_INVALID_MESSAGE;
  const field = fields.find((f) => f.id === fieldId);
  const label = field?.label ?? fieldId;

  // A required option-less checkbox ("must be checked") is validated with
  // `z.literal(true)`. A literal schema has no separate "missing" case — it
  // only ever reports "not equal to the one accepted value" — so both an
  // absent key AND an explicit `false` (itself a perfectly well-typed,
  // *present* value) surface identically as an `invalid_value` issue.
  // Checked before the generic presence-based classification below,
  // because that generic check would otherwise see `false` as "present
  // with some other value" and misreport it as "không hợp lệ".
  if (
    field?.type === "checkbox" &&
    field.options.length === 0 &&
    field.required &&
    issue.code === "invalid_value"
  ) {
    return `Trường "${label}" là bắt buộc.`;
  }

  // Everything else: "missing" means the key was never sent, or was sent
  // as something that's meaningfully empty — mirroring `buildFormSchema`'s
  // own `emptyToUndefined` semantics, so the route and the schema agree on
  // what "nothing was provided" means. Anything else that still failed
  // validation is a real, present, wrong value.
  const hasKey = Object.hasOwn(data, fieldId);
  const rawValue = data[fieldId];
  const isEmptyValue =
    rawValue === undefined ||
    rawValue === null ||
    (typeof rawValue === "string" && rawValue.trim() === "") ||
    (Array.isArray(rawValue) && rawValue.length === 0);

  if (!hasKey || isEmptyValue) {
    return `Trường "${label}" là bắt buộc.`;
  }

  return `Trường "${label}" không hợp lệ.`;
}

/** Strips control characters (Task 10's `sanitizePlainText`) from every string value — and every string inside an array value (checkbox selections) — before a submission is stored. */
function sanitizeSubmissionData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizePlainText(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => (typeof item === "string" ? sanitizePlainText(item) : item));
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Defense in depth mirroring the wishes route: `sanitizePlainText` can turn
 * a string that already passed Zod's "non-empty" check (e.g. a value made
 * up entirely of a control character) into an empty string. Re-checked
 * here, after sanitizing, for every required field whose *validated* value
 * is a string — enum-backed fields (select/radio/checkbox-with-options)
 * can't hit this, since sanitizing never turns one declared option into a
 * different one, and numbers/booleans/date strings can't either.
 */
function findEmptyRequiredStringField(fields: FormField[], data: Record<string, unknown>): FormField | null {
  for (const field of fields) {
    if (!field.required) continue;
    const value = data[field.id];
    if (typeof value === "string" && value.trim() === "") {
      return field;
    }
  }
  return null;
}

/**
 * Public: submit a guest response (RSVP or any other schema-driven form) to
 * one `form` section of a published invitation. The section's `fields` are
 * always read from the invitation's *published* document, never trusted
 * from the request body — a guest (or a tampered client) declaring its own
 * field list can't bypass validation or write arbitrary keys.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const invitation = await findPublishedInvitation(slug);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const documentResult = InvitationDocumentSchema.safeParse(invitation.publishedDocument);
  if (!documentResult.success) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_INVALID_MESSAGE }, { status: 400 });
  }

  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    return NextResponse.json({ error: GENERIC_INVALID_MESSAGE }, { status: 400 });
  }
  const { sectionId, data, guestToken } = envelope.data;

  const section = findFormSection(documentResult.data.sections, sectionId);
  if (!section) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  // Rate-limited per IP+slug+section (not just IP+slug, as wishes is) so a
  // burst against one form on an invitation with several never throttles an
  // unrelated one on the same invitation.
  const ip = getClientIp(request);
  const allowed = await rateLimit(`form:${ip}:${slug}:${sectionId}`, SUBMISSION_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút." },
      { status: 429 },
    );
  }

  const fields = section.props.fields;
  const parsed = buildFormSchema(fields).safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error, fields, data) },
      { status: 400 },
    );
  }

  const sanitizedData = sanitizeSubmissionData(parsed.data);
  const emptyField = findEmptyRequiredStringField(fields, sanitizedData);
  if (emptyField) {
    return NextResponse.json({ error: `Trường "${emptyField.label}" là bắt buộc.` }, { status: 400 });
  }

  // A `guestToken` is only ever a courtesy link between a submission and a
  // `Guest` row (for the owner's responses view) — an unrecognized or
  // foreign one never fails the request, it's just stored as absent.
  let matchedGuestToken: string | null = null;
  if (guestToken) {
    const guest = await prisma.guest.findUnique({ where: { token: guestToken } });
    if (guest && guest.invitationId === invitation.id) {
      matchedGuestToken = guest.token;
    }
  }

  const submission = await prisma.formSubmission.create({
    data: {
      invitationId: invitation.id,
      sectionId: section.id,
      data: sanitizedData as Prisma.InputJsonValue,
      guestToken: matchedGuestToken,
    },
  });

  return NextResponse.json(
    { submission: { id: submission.id, createdAt: submission.createdAt } },
    { status: 201 },
  );
}
