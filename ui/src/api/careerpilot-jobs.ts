import type {
  CareerPilotJobListing,
  CareerPilotJobSearchInput,
  CareerPilotJobSearchResponse,
  CareerPilotJobStatusUpdate,
  CareerPilotJobsListResponse,
} from "@paperclipai/shared";
import { api } from "./client";

export const careerPilotJobsApi = {
  list: (companyId: string) =>
    api.get<CareerPilotJobsListResponse>(`/companies/${encodeURIComponent(companyId)}/careerpilot/jobs`),
  search: (companyId: string, input: CareerPilotJobSearchInput) =>
    api.post<CareerPilotJobSearchResponse>(
      `/companies/${encodeURIComponent(companyId)}/careerpilot/jobs/search`,
      input,
    ),
  updateStatus: (companyId: string, jobId: string, input: CareerPilotJobStatusUpdate) =>
    api.patch<{ job: CareerPilotJobListing }>(
      `/companies/${encodeURIComponent(companyId)}/careerpilot/jobs/${encodeURIComponent(jobId)}/status`,
      input,
    ),
};
