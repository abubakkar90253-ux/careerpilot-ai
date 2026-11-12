import { describe, expect, it } from "vitest";
import { assessCareerPilotJobMatch } from "@paperclipai/shared";

describe("CareerPilot profile keyword matching", () => {
  it("calculates a transparent score and lists skills absent from profile text", () => {
    const result = assessCareerPilotJobMatch(["Python", "SQL", "Power BI"], "Python, SQL, and reporting projects");
    expect(result).toMatchObject({
      score: 67,
      matchingSkills: ["Python", "SQL"],
      missingSkills: ["Power BI"],
      eligibility: "not_verified",
    });
    expect(result.explanation).toContain("keyword overlap only");
  });

  it("does not produce a score when candidate evidence or job skills are unavailable", () => {
    expect(assessCareerPilotJobMatch(["Python"], "")).toMatchObject({ score: null, eligibility: "not_verified" });
    expect(assessCareerPilotJobMatch([], "Python")).toMatchObject({ score: null, eligibility: "not_verified" });
  });

  it("does not match short skill names inside unrelated words", () => {
    expect(assessCareerPilotJobMatch(["R", "Go"], "Research and ongoing work").score).toBe(0);
  });
});
