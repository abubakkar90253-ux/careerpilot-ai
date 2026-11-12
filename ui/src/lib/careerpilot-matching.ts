import { assessCareerPilotJobMatch, type CareerPilotJobListing } from "@paperclipai/shared";
import type { CareerPilotProfile } from "./careerpilot-profile";

export function assessCareerPilotListing(job: CareerPilotJobListing, profile: CareerPilotProfile) {
  const candidateEvidence = [profile.skills, profile.projects, profile.education].filter(Boolean).join("\n");
  return assessCareerPilotJobMatch(job.skills, candidateEvidence);
}
