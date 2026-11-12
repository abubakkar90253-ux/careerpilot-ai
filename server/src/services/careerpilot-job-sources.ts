import { existsSync } from "node:fs";
import type {
  CareerPilotJobSearchInput,
  CareerPilotJobSourceResult,
  CareerPilotProviderJob,
} from "@paperclipai/shared";
import { extractCareerPilotSkills } from "@paperclipai/shared";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { searchAdzunaJobs } from "./careerpilot-adzuna.js";

const MAX_BOARD_CONFIGS = 20;
const MAX_RESPONSE_BYTES = 8_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface BoardConfig {
  label: string;
  token: string;
  region: "global" | "eu";
}

interface ParsedBoardConfigs {
  boards: BoardConfig[];
  configurationFailures: number;
}

interface BoardSearchResult<T> {
  jobs: T[];
  failures: number;
  errors: string[];
}

interface SourceResult {
  source: CareerPilotJobSourceResult;
  jobs: CareerPilotProviderJob[];
}

export interface CareerPilotJobSourceConfig {
  adzunaAppId?: string;
  adzunaAppKey?: string;
  greenhouseBoards?: string;
  leverBoards?: string;
  ashbyBoards?: string;
  searxngUrl?: string;
}

const greenhouseResponseSchema = z.object({
  jobs: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    company_name: z.string().nullish(),
    first_published: z.string().nullish(),
    location: z.object({ name: z.string().optional() }).nullish(),
    absolute_url: z.string().nullish(),
    content: z.string().nullish(),
    metadata: z.array(z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]).nullish(),
    }).passthrough()).nullish(),
  }).passthrough()),
}).passthrough();

const leverResponseSchema = z.array(z.object({
  id: z.string(),
  text: z.string(),
  categories: z.object({
    location: z.string().nullish(),
    allLocations: z.array(z.string()).optional(),
    commitment: z.string().nullish(),
  }).nullish(),
  descriptionPlain: z.string().nullish(),
  description: z.string().nullish(),
  hostedUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  workplaceType: z.string().nullish(),
  createdAt: z.number().nullish(),
  salaryRange: z.object({
    currency: z.string().nullish(),
    interval: z.string().nullish(),
    min: z.number().nullish(),
    max: z.number().nullish(),
  }).nullish(),
}).passthrough());

const ashbyCompensationComponentSchema = z.object({
  compensationType: z.string(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
}).passthrough();

const ashbyCompensationSchema = z.object({
  summaryComponents: z.array(ashbyCompensationComponentSchema).optional(),
  compensationTiers: z.array(z.object({
    components: z.array(ashbyCompensationComponentSchema).optional(),
  }).passthrough()).optional(),
}).passthrough();

const ashbyResponseSchema = z.object({
  jobs: z.array(z.object({
    title: z.string(),
    location: z.string().nullish(),
    isListed: z.boolean().optional(),
    descriptionPlain: z.string().nullish(),
    descriptionHtml: z.string().nullish(),
    publishedAt: z.string().nullish(),
    employmentType: z.string().nullish(),
    workplaceType: z.string().nullish(),
    jobUrl: z.string().nullish(),
    applyUrl: z.string().nullish(),
    compensation: ashbyCompensationSchema.nullish(),
  }).passthrough()),
}).passthrough();

const searxResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    content: z.string().nullish(),
    publishedDate: z.string().nullish(),
  }).passthrough()),
}).passthrough();

function parseBoards(value: string | undefined, source: string): ParsedBoardConfigs {
  if (!value?.trim()) return { boards: [], configurationFailures: 0 };
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const boards: BoardConfig[] = [];
  let configurationFailures = 0;
  for (const [index, entry] of entries.entries()) {
    if (index >= MAX_BOARD_CONFIGS) {
      configurationFailures += 1;
      continue;
    }
    const [rawLabel, rawToken] = entry.split("=", 2);
    const tokenAndRegion = (rawToken ?? rawLabel).trim();
    const label = rawToken ? rawLabel.trim() : "";
    const isEu = source === "lever" && tokenAndRegion.endsWith("@eu");
    const token = (isEu ? tokenAndRegion.slice(0, -3) : tokenAndRegion).trim();
    if (!token || label.length > 100 || !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,99}$/.test(token)) {
      configurationFailures += 1;
      continue;
    }
    boards.push({ label, token, region: isEu ? "eu" : "global" });
  }
  return { boards, configurationFailures };
}

function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalizeJobUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}

function safeAtsUrl(value: string | null | undefined, provider: "greenhouse" | "lever" | "ashby"): string | null {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return null;
  const hostname = new URL(safeUrl).hostname.toLowerCase();
  const allowed = provider === "greenhouse"
    ? hostname === "greenhouse.io" || hostname.endsWith(".greenhouse.io")
    : provider === "lever"
      ? hostname === "lever.co" || hostname.endsWith(".lever.co")
      : hostname === "ashbyhq.com" || hostname.endsWith(".ashbyhq.com");
  return allowed ? safeUrl : null;
}

function htmlToText(value: string | null | undefined): string {
  if (!value) return "";
  const decoded = decodeHtmlEntities(decodeHtmlEntities(value));
  return decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 20_000);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => decodeCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => decodeCodePoint(Number.parseInt(hex, 16)));
}

function decodeCodePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
}

function toDate(value: string | number | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  return value && /^[a-z]{3}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
}

function ashbySalary(compensation: z.infer<typeof ashbyCompensationSchema> | null | undefined) {
  const components = [
    ...(compensation?.summaryComponents ?? []),
    ...(compensation?.compensationTiers ?? []).flatMap((tier) => tier.components ?? []),
  ].filter((component) => component.compensationType.toLowerCase() === "salary" &&
    (component.minValue != null || component.maxValue != null));
  const currencies = new Set(components.map((component) => normalizeCurrency(component.currencyCode)).filter(Boolean));
  if (currencies.size !== 1) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: currencies.size > 1 ? "UNKNOWN" : null, salaryInterval: null };
  }
  const currency = [...currencies][0] ?? "UNKNOWN";
  const salaryMinValues = components.map((component) => component.minValue).filter((value): value is number => value != null);
  const salaryMaxValues = components.map((component) => component.maxValue).filter((value): value is number => value != null);
  const intervals = new Set(components.map((component) => component.interval?.trim()).filter(Boolean));
  const salaryMin = salaryMinValues.length ? Math.min(...salaryMinValues) : null;
  const salaryMax = salaryMaxValues.length ? Math.max(...salaryMaxValues) : null;
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: currency, salaryInterval: null };
  }
  return {
    salaryMin,
    salaryMax,
    salaryCurrency: currency,
    salaryInterval: intervals.size === 1 ? [...intervals][0] ?? null : null,
  };
}

async function fetchJson(url: URL, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Could not reach this public job source.");
  }
  if (!response.ok) throw new Error(`The public job source returned HTTP ${response.status}.`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("The public job source response exceeded the size limit.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The public job source returned invalid JSON.");
  }
}

async function fetchBoards<T>(
  boards: BoardConfig[],
  fetchBoard: (board: BoardConfig) => Promise<T[]>,
): Promise<BoardSearchResult<T>> {
  const jobs: T[] = [];
  const errors: string[] = [];
  let failures = 0;
  for (let index = 0; index < boards.length; index += 4) {
    const batch = await Promise.all(boards.slice(index, index + 4).map(async (board) => {
      try {
        return { jobs: await fetchBoard(board), error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The company board search failed unexpectedly.";
        return {
          jobs: [] as T[],
          error: message.replaceAll(board.token, "[board]").slice(0, 240),
        };
      }
    }));
    for (const result of batch) {
      jobs.push(...result.jobs);
      if (result.error) {
        failures += 1;
        if (errors.length < 3) errors.push(result.error);
      }
    }
  }
  return { jobs, failures, errors };
}

async function searchGreenhouse(
  boards: BoardConfig[],
  fetcher: typeof fetch,
  configurationFailures = 0,
): Promise<BoardSearchResult<CareerPilotProviderJob>> {
  const result = await fetchBoards(boards, async (board) => {
    const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs`);
    url.searchParams.set("content", "true");
    const parsed = greenhouseResponseSchema.safeParse(await fetchJson(url, fetcher));
    if (!parsed.success) throw new Error("Greenhouse returned an unexpected response.");
    return parsed.data.jobs.flatMap((job) => {
      const sourceUrl = safeAtsUrl(job.absolute_url, "greenhouse");
      const description = htmlToText(job.content);
      const metadata = job.metadata ?? [];
      const metadataValue = (name: string) => metadata.find((field) => field.name.toLowerCase() === name)?.value;
      const workplaceType = metadataValue("workplace type");
      const employmentType = metadataValue("employment type");
      return [{
        provider: "greenhouse" as const,
        providerJobId: `${board.token}:${String(job.id)}`,
        title: job.title.trim().slice(0, 500),
        company: board.label || job.company_name?.trim().slice(0, 300) || "",
        location: job.location?.name?.trim().slice(0, 500) ?? "",
        description,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryInterval: null,
        salaryIsPredicted: false,
        postedAt: toDate(job.first_published),
        sourceUrl,
        officialApplicationUrl: sourceUrl,
        workplaceType: typeof workplaceType === "string" ? workplaceType : null,
        employmentType: typeof employmentType === "string" ? employmentType : null,
        skills: extractCareerPilotSkills(description),
        verificationStatus: "public_board" as const,
      }];
    });
  });
  return {
    ...result,
    failures: result.failures + configurationFailures,
    errors: configurationFailures > 0 && result.errors.length < 3
      ? [...result.errors, "Some board settings are invalid or exceed the supported limit."]
      : result.errors,
  };
}

async function searchLever(
  boards: BoardConfig[],
  fetcher: typeof fetch,
  configurationFailures = 0,
): Promise<BoardSearchResult<CareerPilotProviderJob>> {
  const result = await fetchBoards(boards, async (board) => {
    const apiHost = board.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const url = new URL(`https://${apiHost}/v0/postings/${encodeURIComponent(board.token)}`);
    url.searchParams.set("mode", "json");
    const parsed = leverResponseSchema.safeParse(await fetchJson(url, fetcher));
    if (!parsed.success) throw new Error("Lever returned an unexpected response.");
    return parsed.data.map((job) => {
      const sourceUrl = safeAtsUrl(job.hostedUrl, "lever");
      const applyUrl = safeAtsUrl(job.applyUrl, "lever");
      const description = htmlToText(job.descriptionPlain ?? job.description);
      return {
        provider: "lever" as const,
        providerJobId: `${board.token}:${job.id}`,
        title: job.text.trim().slice(0, 500),
        company: board.label,
        location: [job.categories?.location, ...(job.categories?.allLocations ?? [])]
          .filter((value): value is string => Boolean(value?.trim()))
          .filter((value, index, list) => list.indexOf(value) === index)
          .join(", ")
          .slice(0, 500),
        description,
        salaryMin: job.salaryRange?.min ?? null,
        salaryMax: job.salaryRange?.max ?? null,
        salaryCurrency: normalizeCurrency(job.salaryRange?.currency),
        salaryInterval: job.salaryRange?.interval?.trim() || null,
        salaryIsPredicted: false,
        postedAt: toDate(job.createdAt),
        sourceUrl: sourceUrl ?? applyUrl,
        officialApplicationUrl: applyUrl,
        workplaceType: job.workplaceType ?? null,
        employmentType: job.categories?.commitment ?? null,
        skills: extractCareerPilotSkills(description),
        verificationStatus: "public_board" as const,
      };
    });
  });
  return {
    ...result,
    failures: result.failures + configurationFailures,
    errors: configurationFailures > 0 && result.errors.length < 3
      ? [...result.errors, "Some board settings are invalid or exceed the supported limit."]
      : result.errors,
  };
}

async function searchAshby(
  boards: BoardConfig[],
  fetcher: typeof fetch,
  configurationFailures = 0,
): Promise<BoardSearchResult<CareerPilotProviderJob>> {
  const result = await fetchBoards(boards, async (board) => {
    const url = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}`);
    url.searchParams.set("includeCompensation", "true");
    const parsed = ashbyResponseSchema.safeParse(await fetchJson(url, fetcher));
    if (!parsed.success) throw new Error("Ashby returned an unexpected response.");
    return parsed.data.jobs.filter((job) => job.isListed !== false).map((job, index) => {
      const sourceUrl = safeAtsUrl(job.jobUrl, "ashby");
      const applyUrl = safeAtsUrl(job.applyUrl, "ashby");
      const description = htmlToText(job.descriptionPlain ?? job.descriptionHtml);
      const salary = ashbySalary(job.compensation);
      return {
        provider: "ashby" as const,
        providerJobId: `${board.token}:${sourceUrl ?? applyUrl ?? `${job.title}:${index}`}`,
        title: job.title.trim().slice(0, 500),
        company: board.label,
        location: job.location?.trim().slice(0, 500) ?? "",
        description,
        salaryMin: salary.salaryMin,
        salaryMax: salary.salaryMax,
        salaryCurrency: salary.salaryCurrency,
        salaryInterval: salary.salaryInterval,
        salaryIsPredicted: false,
        postedAt: toDate(job.publishedAt),
        sourceUrl: sourceUrl ?? applyUrl,
        officialApplicationUrl: applyUrl,
        workplaceType: job.workplaceType ?? null,
        employmentType: job.employmentType ?? null,
        skills: extractCareerPilotSkills(description),
        verificationStatus: "public_board" as const,
      };
    });
  });
  return {
    ...result,
    failures: result.failures + configurationFailures,
    errors: configurationFailures > 0 && result.errors.length < 3
      ? [...result.errors, "Some board settings are invalid or exceed the supported limit."]
      : result.errors,
  };
}

function searxngBaseUrl(configuredUrl: string | undefined): URL {
  const defaultHost = existsSync("/.dockerenv") ? "searxng" : "localhost";
  const base = new URL(configuredUrl?.trim() || `http://${defaultHost}:8080`);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("CAREERPILOT_SEARXNG_URL must be an HTTP(S) URL without embedded credentials.");
  }
  const baseWithSlash = new URL(`${base.toString().replace(/\/?$/, "/")}`);
  return new URL("search", baseWithSlash);
}

async function searchSearxng(
  input: CareerPilotJobSearchInput,
  configuredUrl: string | undefined,
  fetcher: typeof fetch,
): Promise<CareerPilotProviderJob[]> {
  let url: URL;
  try {
    url = searxngBaseUrl(configuredUrl);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "SearXNG URL configuration is invalid.");
  }
  const terms = [input.role, input.location, input.careerStage === "any" ? "fresher graduate entry-level" : input.careerStage];
  if (input.experience) terms.push(input.experience);
  if (input.workArrangement !== "any") terms.push(input.workArrangement);
  url.searchParams.set("q", terms.join(" "));
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "1");
  let payload: unknown;
  try {
    payload = await fetchJson(url, fetcher);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SearXNG search failed.";
    if (message.includes("HTTP 403")) {
      throw new Error("SearXNG JSON output is disabled. Enable the json format in SearXNG settings.");
    }
    if (message.includes("Could not reach") && !configuredUrl?.trim()) {
      const defaultHost = existsSync("/.dockerenv") ? "searxng" : "localhost";
      throw new Error(
        `Could not connect to SearXNG at http://${defaultHost}:8080. Start SearXNG or set CAREERPILOT_SEARXNG_URL.`,
      );
    }
    throw error;
  }
  const parsed = searxResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("SearXNG returned an unexpected search response.");
  return parsed.data.results.flatMap((result) => {
    const sourceUrl = safeHttpsUrl(result.url);
    if (!sourceUrl) return [];
    const description = htmlToText(result.content);
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    const provider = hostname.endsWith(".greenhouse.io") || hostname === "greenhouse.io"
      ? "greenhouse"
      : hostname.endsWith(".lever.co") || hostname === "lever.co"
        ? "lever"
        : hostname.endsWith(".ashbyhq.com") || hostname === "ashbyhq.com"
          ? "ashby"
          : "searxng";
    return [{
      provider: "searxng" as const,
      providerJobId: canonicalizeJobUrl(sourceUrl),
      title: result.title.trim().slice(0, 500),
      company: "",
      location: "",
      description,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryInterval: null,
      salaryIsPredicted: false,
      postedAt: toDate(result.publishedDate),
      sourceUrl,
      officialApplicationUrl: provider === "searxng" ? null : sourceUrl,
      workplaceType: null,
      employmentType: null,
      skills: extractCareerPilotSkills(`${result.title}\n${description}`),
      verificationStatus: "search_snippet" as const,
    }];
  });
}

function matchesSearchPreferences(job: CareerPilotProviderJob, input: CareerPilotJobSearchInput): boolean {
  const content = `${job.title}\n${job.description}`.toLowerCase();
  const roleWords = input.role.toLowerCase().split(/[^a-z0-9+#]+/).filter((word) => word.length > 1);
  if (roleWords.length && !roleWords.every((word) => content.includes(word))) return false;

  if (input.preferredCompanies.length) {
    const company = job.company.toLowerCase();
    if (!company || !input.preferredCompanies.some((preferred) => preferred.toLowerCase() === company)) return false;
  }

  const salaryIsAnnualInInr = job.salaryCurrency === "INR" && job.salaryInterval !== null &&
    /\b(year|yearly|annual|annually)\b/i.test(job.salaryInterval);
  if (salaryIsAnnualInInr) {
    if (input.minSalary !== undefined && job.salaryMax !== null && job.salaryMax < input.minSalary) return false;
    if (input.maxSalary !== undefined && job.salaryMin !== null && job.salaryMin > input.maxSalary) return false;
  }

  if (input.workArrangement !== "any" && job.workplaceType) {
    const workplace = job.workplaceType.toLowerCase().replace(/[-_]/g, " ");
    const desired = input.workArrangement === "onsite" ? "on site" : input.workArrangement;
    const matchesDesired = input.workArrangement === "onsite"
      ? workplace.includes("on site") || workplace.includes("onsite")
      : workplace.includes(desired);
    if (!/\b(unspecified|unknown)\b/i.test(workplace) && !matchesDesired) return false;
  }

  if (input.careerStage === "internship" && !/\bintern(ship)?\b/i.test(content)) return false;
  if (input.careerStage === "fresher" || input.careerStage === "entry-level") {
    if (/\b(senior|staff|principal|lead|director|manager)\b/i.test(job.title)) return false;
    const earlyCareerCue = /\b(fresher|graduate|entry[- ]level|junior|intern(ship)?|early[- ]career|new grad)\b/i.test(content) ||
      /\b(0|1|2)\s*(?:\+|to|-|–)?\s*(?:years?|yrs?)\b/i.test(content);
    if (!earlyCareerCue) return false;
  }

  const normalizedLocation = input.location.toLowerCase();
  const jobLocation = job.location.toLowerCase();
  if (normalizedLocation && jobLocation && !jobLocation.includes(normalizedLocation)) {
    if (normalizedLocation === "india") {
      const indianLocation = /\b(india|bengaluru|bangalore|mumbai|new delhi|delhi|hyderabad|chennai|pune|kolkata|gurugram|gurgaon|noida|ahmedabad|jaipur|kochi|coimbatore|indore)\b/i.test(job.location);
      const explicitlyOtherRegion = /\b(usa|united states|canada|europe|european union|uk|united kingdom|australia|singapore)\b/i.test(job.location);
      const unspecifiedRemoteLocation = /\bremote\b/i.test(job.location) && !explicitlyOtherRegion;
      if (!indianLocation && !unspecifiedRemoteLocation) return false;
    } else if (!jobLocation.includes("remote")) {
      return false;
    }
  }
  return true;
}

function deduplicateJobs(jobs: CareerPilotProviderJob[]): CareerPilotProviderJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const canonicalUrl = job.sourceUrl ? canonicalizeJobUrl(job.sourceUrl) : "";
    const key = canonicalUrl || `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.location.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceResult(
  source: CareerPilotJobSourceResult["source"],
  status: CareerPilotJobSourceResult["status"],
  count: number,
  message?: string,
): SourceResult {
  return {
    source: { source, status, count, ...(message ? { message } : {}) },
    jobs: [],
  };
}

async function settledSource(
  source: CareerPilotJobSourceResult["source"],
  task: () => Promise<CareerPilotProviderJob[]>,
): Promise<SourceResult> {
  try {
    const jobs = await task();
    return { source: { source, status: "success", count: jobs.length }, jobs };
  } catch (error) {
    return sourceResult(
      source,
      "error",
      0,
      error instanceof Error ? error.message : "This job source failed unexpectedly.",
    );
  }
}

async function settledBoardSource(
  source: CareerPilotJobSourceResult["source"],
  task: () => Promise<BoardSearchResult<CareerPilotProviderJob>>,
): Promise<SourceResult> {
  try {
    const result = await task();
    return {
      jobs: result.jobs,
      source: {
        source,
        status: result.failures > 0 ? (result.jobs.length > 0 ? "partial" : "error") : "success",
        count: result.jobs.length,
        ...(result.failures > 0 ? {
          message: `${result.failures} configured board(s) could not be searched.${result.errors.length ? ` ${result.errors.join(" ")}` : ""}${result.failures > result.errors.length ? ` ${result.failures - result.errors.length} additional board(s) failed.` : ""}`,
        } : {}),
      },
    };
  } catch (error) {
    return sourceResult(
      source,
      "error",
      0,
      error instanceof Error ? error.message : "This job source failed unexpectedly.",
    );
  }
}

export async function searchCareerPilotSources(
  input: CareerPilotJobSearchInput,
  config: CareerPilotJobSourceConfig,
  fetcher: typeof fetch = fetch,
): Promise<{
  status: "success" | "partial" | "failed";
  jobs: CareerPilotProviderJob[];
  sources: CareerPilotJobSourceResult[];
}> {
  const greenhouseBoards = parseBoards(config.greenhouseBoards, "greenhouse");
  const leverBoards = parseBoards(config.leverBoards, "lever");
  const ashbyBoards = parseBoards(config.ashbyBoards, "ashby");

  const jobsBySource = await Promise.all([
    greenhouseBoards.boards.length || greenhouseBoards.configurationFailures
      ? settledBoardSource("greenhouse", () =>
        searchGreenhouse(greenhouseBoards.boards, fetcher, greenhouseBoards.configurationFailures))
      : Promise.resolve(sourceResult("greenhouse", "skipped", 0, "Configure CAREERPILOT_GREENHOUSE_BOARDS to search selected company boards.")),
    leverBoards.boards.length || leverBoards.configurationFailures
      ? settledBoardSource("lever", () => searchLever(leverBoards.boards, fetcher, leverBoards.configurationFailures))
      : Promise.resolve(sourceResult("lever", "skipped", 0, "Configure CAREERPILOT_LEVER_BOARDS to search selected company boards.")),
    ashbyBoards.boards.length || ashbyBoards.configurationFailures
      ? settledBoardSource("ashby", () => searchAshby(ashbyBoards.boards, fetcher, ashbyBoards.configurationFailures))
      : Promise.resolve(sourceResult("ashby", "skipped", 0, "Configure CAREERPILOT_ASHBY_BOARDS to search selected company boards.")),
    config.adzunaAppId?.trim() && config.adzunaAppKey?.trim()
      ? settledSource("adzuna", async () => {
        const listings = await searchAdzunaJobs(input, {
          appId: config.adzunaAppId,
          appKey: config.adzunaAppKey,
        }, fetcher);
        return listings.map((listing) => ({
          provider: "adzuna" as const,
          providerJobId: listing.providerJobId,
          title: listing.title,
          company: listing.company,
          location: listing.location,
          description: listing.description,
          salaryMin: listing.salaryMin,
          salaryMax: listing.salaryMax,
          salaryCurrency: "INR",
          salaryInterval: listing.salaryInterval,
          salaryIsPredicted: listing.salaryIsPredicted,
          postedAt: listing.postedAt,
          sourceUrl: listing.sourceUrl,
          officialApplicationUrl: null,
          workplaceType: null,
          employmentType: null,
          skills: extractCareerPilotSkills(listing.description),
          verificationStatus: "aggregator" as const,
        }));
      })
      : Promise.resolve(sourceResult("adzuna", "skipped", 0, "Set CAREERPILOT_ADZUNA_APP_ID and CAREERPILOT_ADZUNA_APP_KEY to enable Adzuna.")),
    settledSource("searxng", () => searchSearxng(input, config.searxngUrl, fetcher)),
  ]);

  const successfulSources = jobsBySource.filter((result) =>
    result.source.status === "success" || result.source.status === "partial").length;
  const failedSources = jobsBySource.filter((result) =>
    result.source.status === "error" || result.source.status === "partial").length;
  const matchingJobsBySource = jobsBySource.map((result) => ({
    ...result,
    jobs: result.jobs.filter((job) => matchesSearchPreferences(job, input)),
  }));
  const rawJobs = matchingJobsBySource.flatMap((result) => result.jobs);
  const jobs = deduplicateJobs(rawJobs).slice(0, 100);
  return {
    status: successfulSources === 0 ? "failed" : failedSources > 0 ? "partial" : "success",
    jobs,
    sources: matchingJobsBySource.map((result) => ({ ...result.source, count: result.jobs.length })),
  };
}

export function careerPilotSourceConfigFromEnvironment(): CareerPilotJobSourceConfig {
  return {
    adzunaAppId: process.env.CAREERPILOT_ADZUNA_APP_ID,
    adzunaAppKey: process.env.CAREERPILOT_ADZUNA_APP_KEY,
    greenhouseBoards: process.env.CAREERPILOT_GREENHOUSE_BOARDS,
    leverBoards: process.env.CAREERPILOT_LEVER_BOARDS,
    ashbyBoards: process.env.CAREERPILOT_ASHBY_BOARDS,
    searxngUrl: process.env.CAREERPILOT_SEARXNG_URL,
  };
}

export function assertCareerPilotJobSearchInput(input: CareerPilotJobSearchInput): void {
  if (input.minSalary !== undefined && input.maxSalary !== undefined && input.minSalary > input.maxSalary) {
    throw new HttpError(400, "Minimum salary must not be greater than maximum salary.");
  }
}
