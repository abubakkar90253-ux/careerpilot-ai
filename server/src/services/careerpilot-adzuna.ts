import { createRequire } from "node:module";
import type { CareerPilotJobSearchInput } from "@paperclipai/shared";
import { HttpError } from "../errors.js";
import { z } from "zod";

const adzunaResponseSchema = z.object({
  results: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    description: z.string().optional().default(""),
    created: z.string().optional().nullable(),
    redirect_url: z.string().optional().nullable(),
    salary_min: z.number().optional().nullable(),
    salary_max: z.number().optional().nullable(),
    salary_period: z.string().optional().nullable(),
    salary_is_predicted: z.union([z.boolean(), z.number()]).optional().nullable(),
    company: z.object({ display_name: z.string().optional().nullable() }).optional().nullable(),
    location: z.object({ display_name: z.string().optional().nullable() }).optional().nullable(),
  }).passthrough()),
}).passthrough();

export interface AdzunaJobListing {
  providerJobId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: string | null;
  salaryIsPredicted: boolean;
  postedAt: Date | null;
  sourceUrl: string | null;
}

export interface AdzunaCredentials {
  appId: string | undefined;
  appKey: string | undefined;
}

interface TraceContextApi {
  context: {
    active(): unknown;
    with<T>(context: unknown, callback: () => Promise<T>): Promise<T>;
  };
}

interface TraceSuppressionApi {
  suppressTracing(context: unknown): unknown;
}

function safeAdzunaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const trustedHost = hostname === "adzuna.in" ||
      hostname.endsWith(".adzuna.in") ||
      hostname === "adzuna.co.in" ||
      hostname.endsWith(".adzuna.co.in");
    if (url.protocol !== "https:" || !trustedHost || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeSalary(value: number | null | undefined): number | null {
  return value !== undefined && value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeAdzunaResults(payload: unknown): AdzunaJobListing[] {
  const parsed = adzunaResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(502, "Adzuna returned an unexpected job-search response.");
  }

  const unique = new Map<string, AdzunaJobListing>();
  for (const result of parsed.data.results) {
    const providerJobId = String(result.id).trim();
    if (!providerJobId || unique.has(providerJobId)) continue;
    const rawSalaryMin = safeSalary(result.salary_min);
    const rawSalaryMax = safeSalary(result.salary_max);
    const salaryRangeValid = rawSalaryMin === null || rawSalaryMax === null || rawSalaryMin <= rawSalaryMax;
    unique.set(providerJobId, {
      providerJobId,
      title: result.title.trim().slice(0, 500),
      company: result.company?.display_name?.trim().slice(0, 300) ?? "",
      location: result.location?.display_name?.trim().slice(0, 500) ?? "",
      description: result.description.slice(0, 20_000),
      salaryMin: salaryRangeValid ? rawSalaryMin : null,
      salaryMax: salaryRangeValid ? rawSalaryMax : null,
      salaryInterval: result.salary_period?.trim() || null,
      salaryIsPredicted: result.salary_is_predicted === true || result.salary_is_predicted === 1,
      postedAt: toDate(result.created),
      sourceUrl: safeAdzunaUrl(result.redirect_url),
    });
  }
  return [...unique.values()];
}

export async function searchAdzunaJobs(
  input: CareerPilotJobSearchInput,
  credentials: AdzunaCredentials,
  fetcher: typeof fetch = fetch,
): Promise<AdzunaJobListing[]> {
  const appId = credentials.appId?.trim();
  const appKey = credentials.appKey?.trim();
  if (!appId || !appKey) {
    throw new HttpError(
      503,
      "Adzuna is not configured. Set CAREERPILOT_ADZUNA_APP_ID and CAREERPILOT_ADZUNA_APP_KEY on the server, then restart it.",
    );
  }

  const url = new URL("https://api.adzuna.com/v1/api/jobs/in/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("what", input.role);
  url.searchParams.set("what_or", "fresher graduate entry-level junior");
  url.searchParams.set("where", input.location);
  url.searchParams.set("sort_by", "date");
  url.searchParams.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetchWithSecretUrlSuppressed(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }, fetcher);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Could not reach Adzuna. Check the server connection and try again.");
  }
  if (!response.ok) {
    const message = response.status === 429
      ? "Adzuna rate-limited the search. Please try again later."
      : `Adzuna job search failed with HTTP ${response.status}.`;
    throw new HttpError(response.status === 429 ? 503 : 502, message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "Adzuna returned invalid JSON.");
  }
  return normalizeAdzunaResults(payload);
}

function fetchWithSecretUrlSuppressed(
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
    return fetcher(url, init);
  }
  let context: TraceContextApi["context"];
  let suppressTracing: TraceSuppressionApi["suppressTracing"];
  try {
    const require = createRequire(import.meta.url);
    context = (require("@opentelemetry/api") as TraceContextApi).context;
    suppressTracing = (require("@opentelemetry/core") as TraceSuppressionApi).suppressTracing;
  } catch {
    throw new HttpError(503, "Adzuna search is unavailable because request tracing cannot safely suppress its API key.");
  }
  if (!context?.active || !context.with || !suppressTracing) {
    throw new HttpError(503, "Adzuna search is unavailable because request tracing cannot safely suppress its API key.");
  }
  return context.with(suppressTracing(context.active()), () => fetcher(url, init));
}
