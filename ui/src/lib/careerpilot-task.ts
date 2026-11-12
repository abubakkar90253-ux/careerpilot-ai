import { hasCareerPilotProfileContent, type CareerPilotProfile } from "./careerpilot-profile";

export interface CareerPilotTaskInput {
  role: string;
  location: string;
  instructions: string;
  candidateProfile?: CareerPilotProfile;
  includeCandidateProfile?: boolean;
}

export interface CareerPilotTask {
  title: string;
  description: string;
}

export function buildCareerPilotTask(input: CareerPilotTaskInput): CareerPilotTask {
  const role = input.role.trim();
  const location = input.location.trim();
  const instructions = input.instructions.trim();
  if (!role || !location || !instructions) {
    throw new Error("Role, location, and search instructions are required.");
  }
  let candidateProfile: string | null = null;
  if (input.includeCandidateProfile) {
    if (!input.candidateProfile) {
      throw new Error("Add candidate profile details before including them in the task.");
    }
    if (!hasCareerPilotProfileContent(input.candidateProfile)) {
      throw new Error("Add at least one candidate profile detail before including it in the task.");
    }
    candidateProfile = formatCandidateProfile(input.candidateProfile);
  }

  return {
    title: `CareerPilot research: ${role} in ${location}`.slice(0, 200),
    description: [
      "## CareerPilot job research and application preparation",
      "",
      `**Target role:** ${role}`,
      `**Target location:** ${location}`,
      "",
      ...(candidateProfile
        ? ["### Candidate profile supplied for this task", "", candidateProfile, ""]
        : []),
      "### Request",
      instructions,
      "",
      "### Required workflow",
      "1. Use live web search and browser tools to find currently open roles. Prefer official company career pages; use legitimate job boards as additional sources.",
      "2. Verify each opening is still accepting applications. Include the direct posting URL, source, posting date when available, and verification date. Exclude expired, duplicate, or unverified listings.",
      "3. Read the full job description. Report mandatory education, graduation-year, experience, location, and work-authorization requirements. Mark eligibility as unknown when evidence is missing; never claim an unsupported match.",
      "4. Use only facts in the candidate resume/profile supplied to this task. If neither is supplied, stop before candidate-specific matching or writing and ask for it.",
      "5. For eligible, relevant roles, explain the match and gaps, then prepare a truthful, tailored cover letter and application answers for review.",
      "6. Provide an evidence-linked summary and clearly report source, model, browser, or access limitations. Do not invent jobs, hiring status, salary, candidate facts, or successful actions.",
      "",
      "### Approval and access limits",
      "Prepare drafts only. Do not submit applications, send recruiter messages, or make external changes. Wait for explicit human approval for each application. Never bypass CAPTCHA, OTP, MFA, sign-in, or anti-bot controls; pause for the user when manual verification is required.",
    ].join("\n"),
  };
}

function formatCandidateProfile(profile: CareerPilotProfile): string {
  const fields: [keyof CareerPilotProfile, string][] = [
    ["education", "Education"],
    ["graduationYear", "Graduation year"],
    ["skills", "Technical skills"],
    ["projects", "Projects"],
    ["preferredRoles", "Preferred roles"],
    ["preferredLocations", "Preferred locations"],
    ["salaryExpectation", "Salary expectations"],
  ];
  return fields
    .filter(([key]) => profile[key].trim())
    .map(([key, label]) => `- **${label}:** ${profile[key].trim()}`)
    .join("\n");
}
