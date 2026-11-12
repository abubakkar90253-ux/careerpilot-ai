import { describe, expect, it } from "vitest";
import {
  careerPilotProfileStorageKey,
  EMPTY_CAREERPILOT_PROFILE,
  hasCareerPilotProfileContent,
  parseCareerPilotProfile,
  serializeCareerPilotProfile,
} from "./careerpilot-profile";

describe("CareerPilot profile", () => {
  it("round-trips the defined profile fields", () => {
    const profile = { ...EMPTY_CAREERPILOT_PROFILE, education: "BSc Statistics", skills: "Python, SQL" };
    expect(parseCareerPilotProfile(serializeCareerPilotProfile(profile))).toEqual(profile);
  });

  it("returns an empty profile when nothing is saved", () => {
    expect(parseCareerPilotProfile(null)).toEqual(EMPTY_CAREERPILOT_PROFILE);
    expect(hasCareerPilotProfileContent(EMPTY_CAREERPILOT_PROFILE)).toBe(false);
  });

  it("rejects malformed or incomplete saved profile data", () => {
    expect(() => parseCareerPilotProfile("{")).toThrow();
    expect(() => parseCareerPilotProfile(JSON.stringify({ education: "BSc" }))).toThrow("Saved candidate profile is not valid");
  });

  it("scopes profile storage by workspace", () => {
    expect(careerPilotProfileStorageKey("company-a")).not.toBe(careerPilotProfileStorageKey("company-b"));
  });
});
