import { describe, expect, it, vi } from "vitest";
import { careerPilotJobSearchSchema } from "@paperclipai/shared";
import { normalizeAdzunaResults, searchAdzunaJobs } from "../services/careerpilot-adzuna.js";

const query = careerPilotJobSearchSchema.parse({ role: "Data Scientist", location: "India" });
const credentials = { appId: "test-app-id", appKey: "test-app-key" };

describe("CareerPilot Adzuna search", () => {
  it("normalizes results and drops duplicate ids and unsafe listing URLs", () => {
    const jobs = normalizeAdzunaResults({
      results: [
        {
          id: 17,
          title: "Data Scientist",
          description: "Python and statistics",
          created: "2026-03-20T10:00:00Z",
          redirect_url: "https://www.adzuna.co.in/jobs/land/ad/17",
          salary_min: 400000,
          salary_max: 600000,
          salary_is_predicted: 1,
          company: { display_name: "Example Analytics" },
          location: { display_name: "India" },
        },
        { id: "17", title: "Duplicate listing", redirect_url: "https://adzuna.in/jobs/land/ad/17" },
        { id: 18, title: "Unsafe URL", redirect_url: "https://not-adzuna.example/apply" },
        { id: 19, title: "Invalid salary", salary_min: 900000, salary_max: 500000, redirect_url: "https://adzuna.in/jobs/land/ad/19" },
      ],
    });

    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      providerJobId: "17",
      salaryMin: 400000,
      salaryMax: 600000,
      salaryIsPredicted: true,
      sourceUrl: "https://www.adzuna.co.in/jobs/land/ad/17",
    });
    expect(jobs[0]?.postedAt?.toISOString()).toBe("2026-03-20T10:00:00.000Z");
    expect(jobs[1]?.sourceUrl).toBeNull();
    expect(jobs[2]).toMatchObject({ salaryMin: null, salaryMax: null });
  });

  it("calls the India endpoint with role, location, entry-level filters and server credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    await expect(searchAdzunaJobs(query, credentials, fetcher)).resolves.toEqual([]);

    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v1/api/jobs/in/search/1");
    expect(requestUrl.searchParams.get("what")).toBe("Data Scientist");
    expect(requestUrl.searchParams.get("what_or")).toContain("fresher");
    expect(requestUrl.searchParams.get("where")).toBe("India");
    expect(requestUrl.searchParams.get("app_id")).toBe(credentials.appId);
    expect(requestUrl.searchParams.get("app_key")).toBe(credentials.appKey);
  });

  it("reports missing credentials without making a provider request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(searchAdzunaJobs(query, { appId: undefined, appKey: undefined }, fetcher))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("CAREERPILOT_ADZUNA_APP_KEY") });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces provider and response failures without returning fake listings", async () => {
    const rateLimited = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 }));
    await expect(searchAdzunaJobs(query, credentials, rateLimited))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("rate-limited") });

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: "missing id" }] }), { status: 200 }),
    );
    await expect(searchAdzunaJobs(query, credentials, malformed))
      .rejects.toMatchObject({ status: 502, message: expect.stringContaining("unexpected") });
  });
});
