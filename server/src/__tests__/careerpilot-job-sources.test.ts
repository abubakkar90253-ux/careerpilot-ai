import { describe, expect, it, vi } from "vitest";
import { careerPilotJobSearchSchema } from "@paperclipai/shared";
import { searchCareerPilotSources } from "../services/careerpilot-job-sources.js";

const query = careerPilotJobSearchSchema.parse({ role: "Data Analyst", location: "India" });

describe("CareerPilot public job sources", () => {
  it("searches Greenhouse, Lever, and SearXNG, extracts real source fields, and de-duplicates URLs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "boards-api.greenhouse.io") {
        return new Response(JSON.stringify({
          jobs: [{
            id: 11,
            title: "Junior Data Analyst",
            company_name: "Acme",
            first_published: "2026-11-10T12:00:00Z",
            location: { name: "Bengaluru, India" },
            absolute_url: "https://boards.greenhouse.io/acme/jobs/11",
            content: "&amp;lt;p&amp;gt;Python and SQL required.&amp;lt;/p&amp;gt;",
            metadata: [{ name: "Workplace Type", value: "Hybrid" }],
          }],
        }), { status: 200 });
      }
      if (url.hostname === "api.lever.co") {
        return new Response(JSON.stringify([{
          id: "lever-22",
          text: "Data Analyst Intern",
          categories: { location: "Remote", commitment: "Internship" },
          descriptionPlain: "Use Python and Power BI.",
          hostedUrl: "https://jobs.lever.co/acme/lever-22",
          applyUrl: "https://jobs.lever.co/acme/lever-22/apply",
          workplaceType: "remote",
          createdAt: 1794400000000,
          salaryRange: { currency: "INR", interval: "YEAR", min: 400000, max: 600000 },
        }]), { status: 200 });
      }
      if (url.hostname === "search.example") {
        return new Response(JSON.stringify({
          results: [{
            title: "Junior Data Analyst",
            url: "https://boards.greenhouse.io/acme/jobs/11",
            content: "Python and SQL required.",
          }],
        }), { status: 200 });
      }
      return new Response("unexpected source", { status: 500 });
    });

    const result = await searchCareerPilotSources(query, {
      greenhouseBoards: "acme",
      leverBoards: "Acme=acme",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("success");
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({
      provider: "greenhouse",
      company: "Acme",
      location: "Bengaluru, India",
      description: "Python and SQL required.",
      salaryCurrency: null,
      postedAt: new Date("2026-11-10T12:00:00.000Z"),
      workplaceType: "Hybrid",
      officialApplicationUrl: "https://boards.greenhouse.io/acme/jobs/11",
      skills: ["Python", "SQL"],
    });
    expect(result.jobs[1]).toMatchObject({
      provider: "lever",
      officialApplicationUrl: "https://jobs.lever.co/acme/lever-22/apply",
      workplaceType: "remote",
      employmentType: "Internship",
      salaryCurrency: "INR",
      salaryInterval: "YEAR",
      salaryMin: 400000,
      salaryMax: 600000,
      skills: ["Python", "Power BI"],
    });
    expect(result.sources).toContainEqual({ source: "greenhouse", status: "success", count: 1 });
    expect(result.sources).toContainEqual({ source: "lever", status: "success", count: 1 });
    expect(result.sources.find(({ source }) => source === "searxng")?.count).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("reports all source failures and does not return fabricated fallback jobs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not enabled", { status: 403 }));
    const result = await searchCareerPilotSources(query, {
      greenhouseBoards: "Acme=acme",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("failed");
    expect(result.jobs).toEqual([]);
    expect(result.sources.find(({ source }) => source === "greenhouse")).toMatchObject({ status: "error", count: 0 });
    expect(result.sources.find(({ source }) => source === "searxng")).toMatchObject({
      status: "error",
      message: expect.stringContaining("JSON output is disabled"),
    });
  });

  it("reports invalid ATS board configuration instead of silently skipping the source", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const result = await searchCareerPilotSources(query, {
      greenhouseBoards: "Acme=invalid%token",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("partial");
    expect(result.sources.find(({ source }) => source === "greenhouse")).toMatchObject({
      status: "error",
      message: "1 configured board(s) could not be searched. Some board settings are invalid or exceed the supported limit.",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports partial provider outages while retaining successful results", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "boards-api.greenhouse.io") {
        return new Response("", { status: 503 });
      }
      return new Response(JSON.stringify({
        results: [{
          title: "Data Analyst",
          url: "https://jobs.example.com/data-analyst",
          content: "SQL reporting",
        }],
      }), { status: 200 });
    });

    const result = await searchCareerPilotSources(query, {
      greenhouseBoards: "Acme=acme",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("partial");
    expect(result.jobs).toHaveLength(1);
    expect(result.sources.find(({ source }) => source === "greenhouse")?.status).toBe("error");
    expect(result.sources.find(({ source }) => source === "searxng")?.status).toBe("success");
  });

  it("keeps successful company-board results when another configured board fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "boards-api.greenhouse.io" && url.pathname.includes("/boards/broken/")) {
        return new Response("", { status: 503 });
      }
      if (url.hostname === "boards-api.greenhouse.io") {
        return new Response(JSON.stringify({
          jobs: [{
            id: 1,
            title: "Data Analyst",
            location: { name: "Bengaluru, India" },
            absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
            content: "SQL reporting",
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const result = await searchCareerPilotSources(query, {
      greenhouseBoards: "Acme=acme,Broken=broken",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("partial");
    expect(result.jobs).toHaveLength(1);
    expect(result.sources.find(({ source }) => source === "greenhouse")).toMatchObject({
      status: "partial",
      count: 1,
      message: "1 configured board(s) could not be searched. The public job source returned HTTP 503.",
    });
  });

  it("normalizes Ashby jobs and their official application pages", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.ashbyhq.com") {
        return new Response(JSON.stringify({
          jobs: [{
            id: "ashby-1",
            title: "Junior Data Scientist",
            location: "Remote - India",
            isListed: true,
            descriptionHtml: "<p>Python, SQL, and machine learning.</p>",
            publishedAt: "2026-11-10T12:00:00Z",
            employmentType: "FullTime",
            workplaceType: "Remote",
            jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
            applyUrl: "https://jobs.ashbyhq.com/acme/ashby-1/application",
            compensation: {
              summaryComponents: [{
                compensationType: "Salary",
                interval: "YEAR",
                currencyCode: "INR",
                minValue: 800000,
                maxValue: 1000000,
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const result = await searchCareerPilotSources(careerPilotJobSearchSchema.parse({
      role: "Data Scientist",
      location: "India",
    }), {
      ashbyBoards: "Acme=acme",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.status).toBe("success");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      provider: "ashby",
      company: "Acme",
      title: "Junior Data Scientist",
      workplaceType: "Remote",
      employmentType: "FullTime",
      salaryMin: 800000,
      salaryMax: 1000000,
      salaryCurrency: "INR",
      salaryInterval: "YEAR",
      officialApplicationUrl: "https://jobs.ashbyhq.com/acme/ashby-1/application",
      skills: ["Python", "SQL", "machine learning"],
    });
  });

  it("applies explicit company and salary filters but keeps jobs whose salary was not published", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const jobs = url.pathname.includes("/boards/acme/")
        ? [{
          id: 1,
          title: "Data Analyst",
          location: { name: "Bengaluru, India" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
          content: "SQL and Power BI",
        }]
        : [{
          id: 2,
          title: "Data Analyst",
          location: { name: "Bengaluru, India" },
          absolute_url: "https://boards.greenhouse.io/other/jobs/2",
          content: "SQL",
        }];
      return new Response(JSON.stringify({ jobs }), { status: 200 });
    });
    const result = await searchCareerPilotSources({
      ...query,
      minSalary: 700000,
      preferredCompanies: ["Acme"],
    }, {
      greenhouseBoards: "Acme=acme,Other=other",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.company).toBe("Acme");
  });

  it("filters explicitly foreign remote postings and senior roles for fresher searches", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      jobs: [
        {
          id: 1,
          title: "Junior Data Scientist",
          location: { name: "Remote" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
          content: "Python and SQL",
        },
        {
          id: 2,
          title: "Data Scientist",
          location: { name: "Remote-USA" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/2",
          content: "Python and SQL",
        },
        {
          id: 3,
          title: "Senior Data Scientist",
          location: { name: "Bengaluru, India" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/3",
          content: "Python and SQL",
        },
      ],
    }), { status: 200 }));

    const result = await searchCareerPilotSources(careerPilotJobSearchSchema.parse({
      role: "Data Scientist",
      location: "India",
      careerStage: "fresher",
    }), {
      greenhouseBoards: "Acme=acme",
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.jobs.map((job) => job.title)).toEqual(["Junior Data Scientist"]);
    expect(result.sources.find(({ source }) => source === "greenhouse")?.count).toBe(1);
  });

  it("rejects malformed or non-HTTPS result URLs from search engines", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { title: "Data Analyst", url: "javascript:alert(1)", content: "SQL" },
        { title: "Data Analyst", url: "https://jobs.example.com/1", content: "SQL" },
      ],
    }), { status: 200 }));
    const result = await searchCareerPilotSources(query, {
      searxngUrl: "http://search.example:8080",
    }, fetcher);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceUrl).toBe("https://jobs.example.com/1");
    expect(result.jobs[0]?.officialApplicationUrl).toBeNull();
  });
});
