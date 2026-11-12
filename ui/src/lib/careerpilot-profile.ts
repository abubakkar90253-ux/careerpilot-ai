export interface CareerPilotProfile {
  education: string;
  graduationYear: string;
  skills: string;
  projects: string;
  preferredRoles: string;
  preferredLocations: string;
  salaryExpectation: string;
}

export const EMPTY_CAREERPILOT_PROFILE: CareerPilotProfile = {
  education: "",
  graduationYear: "",
  skills: "",
  projects: "",
  preferredRoles: "",
  preferredLocations: "",
  salaryExpectation: "",
};

const PROFILE_FIELDS = Object.keys(EMPTY_CAREERPILOT_PROFILE) as (keyof CareerPilotProfile)[];

export function careerPilotProfileStorageKey(companyId: string): string {
  return `careerpilot.profile.${companyId}`;
}

export function parseCareerPilotProfile(raw: string | null): CareerPilotProfile {
  if (!raw) return { ...EMPTY_CAREERPILOT_PROFILE };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Saved candidate profile is not valid. Edit it to replace the saved data.");
  }

  const profile = { ...EMPTY_CAREERPILOT_PROFILE };
  for (const field of PROFILE_FIELDS) {
    const value = (parsed as Record<string, unknown>)[field];
    if (typeof value !== "string") {
      throw new Error("Saved candidate profile is not valid. Edit it to replace the saved data.");
    }
    profile[field] = value.slice(0, 4_000);
  }
  return profile;
}

export function serializeCareerPilotProfile(profile: CareerPilotProfile): string {
  return JSON.stringify(profile);
}

export function hasCareerPilotProfileContent(profile: CareerPilotProfile): boolean {
  return PROFILE_FIELDS.some((field) => profile[field].trim().length > 0);
}
