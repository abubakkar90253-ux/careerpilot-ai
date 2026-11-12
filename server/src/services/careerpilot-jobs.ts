import {
  careerPilotJobWorkflowStatusSchema,
  type CareerPilotJobListing,
  type CareerPilotJobWorkflowStatus,
  type CareerPilotProviderJob,
} from "@paperclipai/shared";
import { careerPilotJobs, type Db } from "@paperclipai/db";
import { and, desc, eq, sql } from "drizzle-orm";

export async function listCareerPilotJobs(db: Db, companyId: string): Promise<CareerPilotJobListing[]> {
  const rows = await db.select().from(careerPilotJobs)
    .where(eq(careerPilotJobs.companyId, companyId))
    .orderBy(desc(careerPilotJobs.lastSeenAt))
    .limit(100);
  return rows.map(toCareerPilotJobListing);
}

export async function saveCareerPilotJobs(
  db: Db,
  companyId: string,
  listings: CareerPilotProviderJob[],
): Promise<CareerPilotJobListing[]> {
  if (listings.length === 0) return [];
  const now = new Date();
  const rows = await db.insert(careerPilotJobs).values(listings.map((listing) => ({
    companyId,
    provider: listing.provider,
    providerJobId: listing.providerJobId,
    title: listing.title,
    company: listing.company,
    location: listing.location,
    description: listing.description,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
    salaryCurrency: listing.salaryCurrency,
    salaryInterval: listing.salaryInterval,
    salaryIsPredicted: listing.salaryIsPredicted,
    postedAt: listing.postedAt,
    sourceUrl: listing.sourceUrl,
    officialApplicationUrl: listing.officialApplicationUrl,
    workplaceType: listing.workplaceType,
    employmentType: listing.employmentType,
    skills: listing.skills,
    verificationStatus: listing.verificationStatus,
    lastSeenAt: now,
    updatedAt: now,
  }))).onConflictDoUpdate({
    target: [careerPilotJobs.companyId, careerPilotJobs.provider, careerPilotJobs.providerJobId],
    set: {
      title: sql`excluded.title`,
      company: sql`excluded.company`,
      location: sql`excluded.location`,
      description: sql`excluded.description`,
      salaryMin: sql`excluded.salary_min`,
      salaryMax: sql`excluded.salary_max`,
      salaryCurrency: sql`excluded.salary_currency`,
      salaryInterval: sql`excluded.salary_interval`,
      salaryIsPredicted: sql`excluded.salary_is_predicted`,
      postedAt: sql`excluded.posted_at`,
      sourceUrl: sql`excluded.source_url`,
      officialApplicationUrl: sql`excluded.official_application_url`,
      workplaceType: sql`excluded.workplace_type`,
      employmentType: sql`excluded.employment_type`,
      skills: sql`excluded.skills`,
      verificationStatus: sql`excluded.verification_status`,
      lastSeenAt: sql`excluded.last_seen_at`,
      updatedAt: sql`excluded.updated_at`,
    },
  }).returning();
  return rows.map(toCareerPilotJobListing);
}

export async function updateCareerPilotJobStatus(
  db: Db,
  companyId: string,
  jobId: string,
  status: CareerPilotJobWorkflowStatus,
): Promise<CareerPilotJobListing | null> {
  const [row] = await db.update(careerPilotJobs)
    .set({ workflowStatus: status, updatedAt: new Date() })
    .where(and(eq(careerPilotJobs.companyId, companyId), eq(careerPilotJobs.id, jobId)))
    .returning();
  return row ? toCareerPilotJobListing(row) : null;
}

function toCareerPilotJobListing(row: typeof careerPilotJobs.$inferSelect): CareerPilotJobListing {
  const provider = row.provider;
  if (!isCareerPilotProvider(provider)) {
    throw new Error(`Unknown CareerPilot job provider stored in the database: ${provider}`);
  }
  return {
    id: row.id,
    provider,
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    salaryInterval: row.salaryInterval,
    salaryIsPredicted: row.salaryIsPredicted,
    postedAt: row.postedAt?.toISOString() ?? null,
    sourceUrl: row.sourceUrl,
    officialApplicationUrl: row.officialApplicationUrl,
    workplaceType: row.workplaceType,
    employmentType: row.employmentType,
    eligibilityNotes: row.eligibilityNotes,
    skills: row.skills,
    verificationStatus: row.verificationStatus,
    workflowStatus: careerPilotJobWorkflowStatusSchema.parse(row.workflowStatus),
    firstDiscoveredAt: row.firstDiscoveredAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function isCareerPilotProvider(value: string): value is CareerPilotJobListing["provider"] {
  return ["adzuna", "greenhouse", "lever", "ashby", "searxng"].includes(value);
}
