import { describe, expect, it } from "vitest";
import { DEFAULT_INVITATION_SETTINGS, parseInvitationSettings } from "../settings";

describe("parseInvitationSettings", () => {
  it("returns the parsed showBadge value when the raw shape is valid", () => {
    expect(parseInvitationSettings({ showBadge: false })).toEqual({ showBadge: false });
    expect(parseInvitationSettings({ showBadge: true })).toEqual({ showBadge: true });
  });

  it("falls back to the default for null", () => {
    expect(parseInvitationSettings(null)).toEqual(DEFAULT_INVITATION_SETTINGS);
  });

  it("falls back to the default when showBadge is missing", () => {
    expect(parseInvitationSettings({})).toEqual(DEFAULT_INVITATION_SETTINGS);
  });

  it("falls back to the default when showBadge isn't a boolean", () => {
    expect(parseInvitationSettings({ showBadge: "true" })).toEqual(DEFAULT_INVITATION_SETTINGS);
  });

  it("falls back to the default for non-object input", () => {
    expect(parseInvitationSettings("nonsense")).toEqual(DEFAULT_INVITATION_SETTINGS);
    expect(parseInvitationSettings(42)).toEqual(DEFAULT_INVITATION_SETTINGS);
    expect(parseInvitationSettings(undefined)).toEqual(DEFAULT_INVITATION_SETTINGS);
  });

  it("default settings has showBadge: true", () => {
    expect(DEFAULT_INVITATION_SETTINGS).toEqual({ showBadge: true });
  });
});
