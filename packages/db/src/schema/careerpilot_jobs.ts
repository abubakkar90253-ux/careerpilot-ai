import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const careerPilotJobs = pgTable(
  "careerpilot_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("adzuna"),
    providerJobId: text("provider_job_id").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull().default(""),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    salaryMin: doublePrecision("salary_min"),
    salaryMax: doublePrecision("salary_max"),
    salaryCurrency: text("salary_currency").default("INR"),
    salaryInterval: text("salary_interval"),
    salaryIsPredicted: boolean("salary_is_predicted").notNull().default(false),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    sourceUrl: text("source_url"),
    officialApplicationUrl: text("official_application_url"),
    workplaceType: text("workplace_type"),
    employmentType: text("employment_type"),
    eligibilityNotes: text("eligibility_notes"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    workflowStatus: text("workflow_status").notNull().default("discovered"),
    firstDiscoveredAt: timestamp("first_discovered_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerJobUnique: uniqueIndex("careerpilot_jobs_company_provider_job_uq")
      .on(table.companyId, table.provider, table.providerJobId),
    companyLastSeen: index("careerpilot_jobs_company_last_seen_idx")
      .on(table.companyId, table.lastSeenAt),
  }),
);
