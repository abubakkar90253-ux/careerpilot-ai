import type { CareerPilotJobListing } from "@paperclipai/shared";
import type { CareerPilotProfile } from "./careerpilot-profile";

export function buildCareerPilotApplicationPrepTask(
  job: CareerPilotJobListing,
  profile: CareerPilotProfile,
  includeProfile: boolean,
): { title: string; description: string } {
  const title = `Prepare application: ${job.title}${job.company ? ` at ${job.company}` : ""}`;
  const profileEvidence = includeProfile
    ? [
      `Education: ${profile.education}`,
      `Graduation year: ${profile.graduationYear}`,
      `Skills: ${profile.skills}`,
      `Projects: ${profile.projects}`,
      `Preferred roles: ${profile.preferredRoles}`,
      `Preferred locations: ${profile.preferredLocations}`,
      `Salary expectations: ${profile.salaryExpectation}`,
    ].filter((line) => !line.endsWith(": ")).join("\n")
    : "No candidate profile facts were provided in this task. Ask for the resume or verified facts before tailoring personal claims.";

  const description = [
    "Prepare, but do not submit, a truthful job application for review.",
    "",
    "## Source listing",
    `- Title: ${job.title}`,
    `- Company: ${job.company || "Not listed in source"}`,
    `- Location: ${job.location || "Not listed in source"}`,
    `- Source: ${job.sourceUrl ?? "No source URL provided"}`,
    `- Application page: ${job.officialApplicationUrl ?? "No official application URL verified"}`,
    `- Listing verification: ${job.verificationStatus}`,
    "",
    "## Job description captured from the source",
    job.description || "[The source did not provide a full description. Open the original listing and report if it cannot be accessed.]",
    "",
    "## Candidate evidence supplied by the user",
    profileEvidence,
    "",
    "## Required work",
    "1. Open the source listing and verify it is still active; report the URL and the evidence you checked.",
    "2. Extract required qualifications, skills, experience, location, and application requirements. Mark unavailable or ambiguous facts as unknown.",
    "3. Compare each requirement only with the candidate evidence above and/or the resume attached to this task. Do not infer missing qualifications.",
    "4. Draft a company-specific cover letter only from verified candidate facts. Use clearly marked placeholders for missing personal/contact details.",
    "5. Prepare a concise list of application answers only where the source material supports them; mark all unanswered questions as needing the candidate.",
    "6. Provide a review checklist and direct official application URL.",
    "",
    "Do not submit an application, contact a recruiter, upload files, or claim any action was completed. Do not bypass CAPTCHA, OTP, MFA, login protections, or other access controls. The candidate must review and approve everything.",
  ].join("\n");

  return { title: title.slice(0, 120), description };
}
