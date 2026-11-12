import { describe, expect, it } from "vitest";
import { buildCareerPilotApplicationPrepTask } from "./careerpilot-application-task";

const job = {
  id: "job-id",
  provider: "greenhouse" as const,
  title: "Junior Data Analyst",
  company: "Example Analytics",
  location: "Bengaluru",
  description: "Python and SQL required.",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "INR",
  salaryInterval: null,
  salaryIsPredicted: false,
  postedAt: null,
  sourceUrl: "https://boards.greenhouse.io/example/jobs/1",
  officialApplicationUrl: "https://boards.greenhouse.io/example/jobs/1",
  workplaceType: null,
  employmentType: null,
  eligibilityNotes: null,
  skills: ["Python", "SQL"],
  verificationStatus: "public_board",
  workflowStatus: "discovered" as const,
  firstDiscoveredAt: "2026-11-11T00:00:00.000Z",
  lastSeenAt: "2026-11-11T00:00:00.000Z",
};

describe("CareerPilot application preparation task", () => {
  it("preserves source evidence and prohibits submission or invented facts", () => {
    const result = buildCareerPilotApplicationPrepTask(job, {
      education: "BSc Statistics",
      graduationYear: "2026",
      skills: "Python",
      projects: "Forecasting project",
      preferredRoles: "",
      preferredLocations: "",
      salaryExpectation: "",
    }, true);

    expect(result.title).toContain(job.title);
    expect(result.description).toContain(job.sourceUrl);
    expect(result.description).toContain("BSc Statistics");
    expect(result.description).toContain("Do not submit an application");
    expect(result.description).toContain("Do not infer missing qualifications");
  });

  it("does not include local profile details unless the user opted in", () => {
    const result = buildCareerPilotApplicationPrepTask(job, {
      education: "Private education",
      graduationYear: "",
      skills: "",
      projects: "",
      preferredRoles: "",
      preferredLocations: "",
      salaryExpectation: "",
    }, false);

    expect(result.description).not.toContain("Private education");
    expect(result.description).toContain("No candidate profile facts were provided");
  });
});
