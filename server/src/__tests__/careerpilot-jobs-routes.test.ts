import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { careerPilotJobRoutes } from "../routes/careerpilot-jobs.js";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
  updateStatus: vi.fn(),
  sourceConfig: vi.fn(),
}));
vi.mock("../services/careerpilot-adzuna.js", () => ({
  searchAdzunaJobs: vi.fn(),
}));
vi.mock("../services/careerpilot-job-sources.js", () => ({
  assertCareerPilotJobSearchInput: vi.fn(),
  careerPilotSourceConfigFromEnvironment: mocks.sourceConfig,
  searchCareerPilotSources: mocks.search,
}));
vi.mock("../services/careerpilot-jobs.js", async () => {
  const actual = await vi.importActual<typeof import("../services/careerpilot-jobs.js")>("../services/careerpilot-jobs.js");
  return {
    ...actual,
    listCareerPilotJobs: mocks.list,
    saveCareerPilotJobs: mocks.save,
    updateCareerPilotJobStatus: mocks.updateStatus,
  };
});

const companyId = "11111111-1111-4111-8111-111111111111";
const jobsUrl = `/api/companies/${companyId}/careerpilot/jobs`;
const member: Express.Request["actor"] = {
  type: "board",
  source: "session",
  userId: "alice",
  companyIds: [companyId],
  memberships: [{ companyId, membershipRole: "member", status: "active" }],
};

function app(actor: Express.Request["actor"] = member) {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  result.use("/api", careerPilotJobRoutes({} as never));
  result.use(errorHandler);
  return result;
}

describe("CareerPilot job routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.search.mockResolvedValue({ status: "failed", jobs: [], sources: [] });
    mocks.save.mockResolvedValue([]);
    mocks.updateStatus.mockResolvedValue(null);
    mocks.sourceConfig.mockReturnValue({});
  });

  it("lists only jobs belonging to an authorized company", async () => {
    const response = await request(app()).get(jobsUrl).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({ jobs: [] });
    expect(mocks.list).toHaveBeenCalledWith({}, companyId);
  });

  it("rejects foreign, viewer, and agent callers before searching", async () => {
    await request(app({ ...member, companyIds: [] })).get(jobsUrl).expect(403);
    await request(app({ ...member, memberships: [{ companyId, membershipRole: "viewer", status: "active" }] }))
      .post(`${jobsUrl}/search`).send({ role: "Data Scientist", location: "India" }).expect(403);
    await request(app({ type: "agent", source: "agent_key", companyId, agentId: "agent" }))
      .get(jobsUrl).expect(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("validates search input and persists real provider results", async () => {
    await request(app()).post(`${jobsUrl}/search`).send({ role: "", location: "India" }).expect(400);
    expect(mocks.search).not.toHaveBeenCalled();

    const listings = [{ provider: "greenhouse", providerJobId: "board:1" }];
    const sources = [{ source: "greenhouse", status: "success", count: 1 }];
    const saved = [{ id: "saved-1", title: "Data Scientist" }];
    mocks.search.mockResolvedValue({ status: "success", jobs: listings, sources });
    mocks.save.mockResolvedValue(saved);
    const response = await request(app()).post(`${jobsUrl}/search`)
      .send({ role: "Data Scientist", location: "India" })
      .expect(200);

    expect(mocks.search).toHaveBeenCalledWith({
      role: "Data Scientist",
      location: "India",
      workArrangement: "any",
      careerStage: "any",
      experience: "",
      preferredCompanies: [],
    }, {});
    expect(mocks.save).toHaveBeenCalledWith({}, companyId, listings);
    expect(response.body).toEqual({ status: "success", fetchedCount: 1, jobs: saved, sources });
  });

  it("reports all-source failures without persisting an empty success-shaped search", async () => {
    const sources = [
      { source: "greenhouse", status: "error", count: 0, message: "board failed" },
      { source: "searxng", status: "error", count: 0, message: "not reachable" },
    ];
    mocks.search.mockResolvedValue({ status: "failed", jobs: [], sources });
    const response = await request(app()).post(`${jobsUrl}/search`)
      .send({ role: "Data Scientist", location: "India" })
      .expect(200);

    expect(response.body).toMatchObject({ status: "failed", fetchedCount: 0, jobs: [], sources });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("updates workflow status only for jobs in the authorized company", async () => {
    const jobId = "22222222-2222-4222-8222-222222222222";
    const job = { id: jobId, workflowStatus: "shortlisted" };
    mocks.updateStatus.mockResolvedValue(job);
    const response = await request(app()).patch(`${jobsUrl}/${jobId}/status`)
      .send({ status: "shortlisted" })
      .expect(200);

    expect(response.body).toEqual({ job });
    expect(mocks.updateStatus).toHaveBeenCalledWith({}, companyId, jobId, "shortlisted");
    await request(app()).patch(`${jobsUrl}/${jobId}/status`).send({ status: "submitted" }).expect(400);
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
  });
});
