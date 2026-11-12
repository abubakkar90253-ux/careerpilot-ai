import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { careerPilotJobs, companies, createDb } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { listCareerPilotJobs, saveCareerPilotJobs, updateCareerPilotJobStatus } from "../services/careerpilot-jobs.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("CareerPilot discovered job persistence", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("upserts the same provider listing without duplicates and scopes it by company", async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-careerpilot-jobs-");
    const db = createDb(tempDb.connectionString);
    const firstCompanyId = randomUUID();
    const secondCompanyId = randomUUID();
    await db.insert(companies).values([
      { id: firstCompanyId, name: "First company", issuePrefix: "CPFIRST" },
      { id: secondCompanyId, name: "Second company", issuePrefix: "CPSECOND" },
    ]);

    const listing = {
      provider: "greenhouse" as const,
      providerJobId: "adzuna-123",
      title: "Junior Data Scientist",
      company: "Analytics Co.",
      location: "Bengaluru",
      description: "Python required",
      salaryMin: 500000,
      salaryMax: 700000,
      salaryCurrency: "INR",
      salaryInterval: "YEAR",
      salaryIsPredicted: false,
      postedAt: new Date("2026-03-20T10:00:00Z"),
      sourceUrl: "https://boards.greenhouse.io/analytics/jobs/123",
      officialApplicationUrl: "https://boards.greenhouse.io/analytics/jobs/123",
      workplaceType: null,
      employmentType: null,
      skills: ["Python"],
      verificationStatus: "public_board" as const,
    };
    const first = await saveCareerPilotJobs(db, firstCompanyId, [listing]);
    const updated = await saveCareerPilotJobs(db, firstCompanyId, [{
      ...listing,
      title: "Junior Data Scientist (Updated)",
      description: "Python and SQL required",
    }]);
    await saveCareerPilotJobs(db, secondCompanyId, [listing]);

    expect(first).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.id).toBe(first[0]?.id);
    expect(updated[0]?.title).toBe("Junior Data Scientist (Updated)");
    expect(updated[0]?.description).toBe("Python and SQL required");
    expect(updated[0]?.workflowStatus).toBe("discovered");
    expect((await updateCareerPilotJobStatus(db, firstCompanyId, updated[0]!.id, "shortlisted"))?.workflowStatus)
      .toBe("shortlisted");
    expect(await listCareerPilotJobs(db, firstCompanyId)).toHaveLength(1);
    expect(await listCareerPilotJobs(db, secondCompanyId)).toHaveLength(1);
    expect(await db.select().from(careerPilotJobs).where(eq(careerPilotJobs.providerJobId, "adzuna-123")))
      .toHaveLength(2);
  }, 60_000);
});
