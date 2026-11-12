import { describe, expect, it } from "vitest";
import { buildCareerPilotTask } from "./careerpilot-task";
import { EMPTY_CAREERPILOT_PROFILE } from "./careerpilot-profile";

describe("buildCareerPilotTask", () => {
  it("creates an evidence-based, approval-gated job research task", () => {
    const task = buildCareerPilotTask({
      role: "Data Scientist",
      location: "India",
      instructions: "Find fresher roles and prepare cover letters.",
    });

    expect(task.title).toBe("CareerPilot research: Data Scientist in India");
    expect(task.description).toContain("currently open roles");
    expect(task.description).toContain("posting URL, source, posting date");
    expect(task.description).toContain("If neither is supplied, stop");
    expect(task.description).toContain("Do not submit applications");
    expect(task.description).toContain("Never bypass CAPTCHA, OTP, MFA");
  });

  it("includes profile facts only when explicitly selected", () => {
    const candidateProfile = {
      ...EMPTY_CAREERPILOT_PROFILE,
      education: "BSc Statistics",
      skills: "Python, SQL",
    };
    const input = {
      role: "Data Scientist",
      location: "India",
      instructions: "Find fresher roles.",
      candidateProfile,
    };

    expect(buildCareerPilotTask(input).description).not.toContain("BSc Statistics");
    const task = buildCareerPilotTask({ ...input, includeCandidateProfile: true });
    expect(task.description).toContain("### Candidate profile supplied for this task");
    expect(task.description).toContain("BSc Statistics");
    expect(task.description).toContain("Python, SQL");
  });

  it("requires non-empty profile details before including a profile", () => {
    expect(() => buildCareerPilotTask({
      role: "Data Scientist",
      location: "India",
      instructions: "Find fresher roles.",
      candidateProfile: EMPTY_CAREERPILOT_PROFILE,
      includeCandidateProfile: true,
    })).toThrow("Add at least one candidate profile detail");
  });

  it("rejects incomplete requests", () => {
    expect(() => buildCareerPilotTask({
      role: "Data Scientist",
      location: "India",
      instructions: " ",
    })).toThrow("Role, location, and search instructions are required.");
  });

  it("bounds generated task titles", () => {
    const task = buildCareerPilotTask({
      role: "Data".repeat(100),
      location: "India",
      instructions: "Search.",
    });
    expect(task.title).toHaveLength(200);
  });
});
