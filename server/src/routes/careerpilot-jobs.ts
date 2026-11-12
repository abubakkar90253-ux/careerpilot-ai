import { Router } from "express";
import { z } from "zod";
import { careerPilotJobSearchSchema, careerPilotJobStatusUpdateSchema } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { listCareerPilotJobs, saveCareerPilotJobs, updateCareerPilotJobStatus } from "../services/careerpilot-jobs.js";
import {
  assertCareerPilotJobSearchInput,
  careerPilotSourceConfigFromEnvironment,
  searchCareerPilotSources,
} from "../services/careerpilot-job-sources.js";

export function careerPilotJobRoutes(db: Db) {
  const router = Router();
  const path = "/companies/:companyId/careerpilot/jobs";

  router.use(path, (req, res, next) => {
    assertBoard(req);
    const companyId = z.string().uuid().parse(req.params.companyId);
    assertCompanyAccess(req, companyId);
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  router.get(path, async (req, res) => {
    const jobs = await listCareerPilotJobs(db, req.params.companyId as string);
    res.json({ jobs });
  });

  router.post(`${path}/search`, validate(careerPilotJobSearchSchema), async (req, res) => {
    assertCareerPilotJobSearchInput(req.body);
    const result = await searchCareerPilotSources(req.body, careerPilotSourceConfigFromEnvironment());
    if (result.status === "failed") {
      res.json({
        status: "failed",
        message: "No configured job source completed successfully. Review the source status details and server configuration.",
        fetchedCount: 0,
        jobs: [],
        sources: result.sources,
      });
      return;
    }
    const jobs = await saveCareerPilotJobs(db, req.params.companyId as string, result.jobs);
    res.json({
      status: result.status,
      fetchedCount: result.jobs.length,
      jobs,
      sources: result.sources,
    });
  });

  router.patch(
    `${path}/:jobId/status`,
    validate(careerPilotJobStatusUpdateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const jobId = z.string().uuid().parse(req.params.jobId);
      const job = await updateCareerPilotJobStatus(db, companyId, jobId, req.body.status);
      if (!job) {
        res.status(404).json({ error: "Job listing not found." });
        return;
      }
      res.json({ job });
    },
  );

  return router;
}
