import { z } from "zod";

export const careerPilotJobSearchSchema = z.object({
  role: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  workArrangement: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
  careerStage: z.enum(["any", "fresher", "internship", "entry-level"]).default("any"),
  minSalary: z.number().finite().min(0).optional(),
  maxSalary: z.number().finite().min(0).optional(),
  experience: z.string().trim().max(120).default(""),
  preferredCompanies: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
}).strict();

export type CareerPilotJobSearchInput = z.infer<typeof careerPilotJobSearchSchema>;

export const careerPilotJobWorkflowStatusSchema = z.enum([
  "discovered",
  "shortlisted",
  "application_prepared",
  "awaiting_approval",
  "submitted",
  "failed",
  "rejected",
]);

export const careerPilotJobStatusUpdateSchema = z.object({
  status: z.enum(["discovered", "shortlisted", "application_prepared", "awaiting_approval", "rejected"]),
}).strict();

export type CareerPilotJobWorkflowStatus = z.infer<typeof careerPilotJobWorkflowStatusSchema>;
export type CareerPilotJobStatusUpdate = z.infer<typeof careerPilotJobStatusUpdateSchema>;

export interface CareerPilotProviderJob {
  provider: "adzuna" | "greenhouse" | "lever" | "ashby" | "searxng";
  providerJobId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryInterval: string | null;
  salaryIsPredicted: boolean;
  postedAt: Date | null;
  sourceUrl: string | null;
  officialApplicationUrl: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  skills: string[];
  verificationStatus: "public_board" | "search_snippet" | "aggregator";
}

export interface CareerPilotJobListing {
  id: string;
  provider: CareerPilotProviderJob["provider"];
  title: string;
  company: string;
  location: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryInterval: string | null;
  salaryIsPredicted: boolean;
  postedAt: string | null;
  sourceUrl: string | null;
  officialApplicationUrl: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  eligibilityNotes: string | null;
  skills: string[];
  verificationStatus: string;
  workflowStatus: CareerPilotJobWorkflowStatus;
  firstDiscoveredAt: string;
  lastSeenAt: string;
}

export interface CareerPilotJobsListResponse {
  jobs: CareerPilotJobListing[];
}

export interface CareerPilotJobSearchResponse extends CareerPilotJobsListResponse {
  status: "success" | "partial" | "failed";
  message?: string;
  fetchedCount: number;
  sources: CareerPilotJobSourceResult[];
}

export interface CareerPilotJobSourceResult {
  source: CareerPilotProviderJob["provider"];
  status: "success" | "partial" | "error" | "skipped";
  count: number;
  message?: string;
}

const CAREERPILOT_SKILL_TERMS = [
  "Python", "R", "SQL", "Excel", "Power BI", "Tableau", "Pandas", "NumPy",
  "scikit-learn", "TensorFlow", "PyTorch", "statistics", "machine learning",
  "deep learning", "natural language processing", "computer vision", "Apache Spark",
  "AWS", "Azure", "Google Cloud", "Git", "A/B testing", "dbt", "ETL",
  "data visualization", "Java", "C++", "large language models",
] as const;

function termPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

export function extractCareerPilotSkills(text: string): string[] {
  return CAREERPILOT_SKILL_TERMS.filter((term) => termPattern(term).test(text));
}

export interface CareerPilotMatchAssessment {
  score: number | null;
  matchingSkills: string[];
  missingSkills: string[];
  explanation: string;
  eligibility: "not_verified";
}

export function assessCareerPilotJobMatch(
  jobSkills: string[],
  candidateEvidence: string,
): CareerPilotMatchAssessment {
  const skills = [...new Set(jobSkills.map((skill) => skill.trim()).filter(Boolean))];
  if (skills.length === 0) {
    return {
      score: null,
      matchingSkills: [],
      missingSkills: [],
      explanation: "No recognized skills were present in the listing; a keyword score cannot be calculated.",
      eligibility: "not_verified",
    };
  }
  if (!candidateEvidence.trim()) {
    return {
      score: null,
      matchingSkills: [],
      missingSkills: skills,
      explanation: "Add resume-backed profile details to calculate keyword overlap. Missing means not shown here, not that you lack the skill.",
      eligibility: "not_verified",
    };
  }

  const matchingSkills = skills.filter((skill) => termPattern(skill).test(candidateEvidence));
  const missingSkills = skills.filter((skill) => !matchingSkills.includes(skill));
  const score = Math.round((matchingSkills.length / skills.length) * 100);
  return {
    score,
    matchingSkills,
    missingSkills,
    explanation: `${matchingSkills.length} of ${skills.length} recognized skills mentioned in the listing also appear in the saved profile. This is keyword overlap only; eligibility is not verified.`,
    eligibility: "not_verified",
  };
}
