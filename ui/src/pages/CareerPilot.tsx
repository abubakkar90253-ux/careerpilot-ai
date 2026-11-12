import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleAlert,
  ExternalLink,
  FileText,
  SearchCheck,
  Trash2,
} from "lucide-react";
import type {
  CareerPilotJobListing,
  CareerPilotJobStatusUpdate,
  CareerPilotJobSearchInput,
  CareerPilotJobSourceResult,
  CareerPilotJobWorkflowStatus,
} from "@paperclipai/shared";
import { careerPilotJobsApi } from "@/api/careerpilot-jobs";
import { Link } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useDialogActions } from "@/context/DialogContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { usePrimaryAgentPresentation } from "@/components/primary-agent/PrimaryAgentPresentation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildCareerPilotTask } from "@/lib/careerpilot-task";
import { buildCareerPilotApplicationPrepTask } from "@/lib/careerpilot-application-task";
import { assessCareerPilotListing } from "@/lib/careerpilot-matching";
import {
  careerPilotProfileStorageKey,
  EMPTY_CAREERPILOT_PROFILE,
  hasCareerPilotProfileContent,
  parseCareerPilotProfile,
  serializeCareerPilotProfile,
  type CareerPilotProfile,
} from "@/lib/careerpilot-profile";

const DEFAULT_INSTRUCTIONS =
  "Find fresher and entry-level Data Science, Data Analyst, and Machine Learning roles in India. Research current openings, check eligibility against my attached resume, rank the best matches, and prepare a tailored cover letter for each eligible role.";

export function CareerPilot() {
  const { selectedCompanyId } = useCompany();
  const selectedCompanyIdRef = useRef(selectedCompanyId);
  selectedCompanyIdRef.current = selectedCompanyId;
  const { openNewIssue } = useDialogActions();
  const primaryAgent = usePrimaryAgentPresentation(selectedCompanyId);
  const { setBreadcrumbs } = useBreadcrumbs();
  const [role, setRole] = useState("Data Scientist");
  const [location, setLocation] = useState("India");
  const [workArrangement, setWorkArrangement] = useState<CareerPilotJobSearchInput["workArrangement"]>("any");
  const [careerStage, setCareerStage] = useState<CareerPilotJobSearchInput["careerStage"]>("fresher");
  const [experience, setExperience] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [preferredCompanies, setPreferredCompanies] = useState("");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CareerPilotProfile>({ ...EMPTY_CAREERPILOT_PROFILE });
  const [profileReady, setProfileReady] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileStorageError, setProfileStorageError] = useState<string | null>(null);
  const [includeProfile, setIncludeProfile] = useState(false);
  const [discoveredJobs, setDiscoveredJobs] = useState<CareerPilotJobListing[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [sourceResults, setSourceResults] = useState<CareerPilotJobSourceResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"success" | "partial" | "failed" | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [searchingJobs, setSearchingJobs] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Job search" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    setProfileReady(false);
    setProfileDirty(false);
    setProfileStorageError(null);
    if (!selectedCompanyId) return;
    try {
      setProfile(parseCareerPilotProfile(localStorage.getItem(careerPilotProfileStorageKey(selectedCompanyId))));
      setProfileReady(true);
    } catch (error) {
      setProfile({ ...EMPTY_CAREERPILOT_PROFILE });
      setProfileStorageError(error instanceof Error ? error.message : "Could not read the saved candidate profile.");
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if ((!profileReady && !profileDirty) || !selectedCompanyId) return;
    try {
      localStorage.setItem(careerPilotProfileStorageKey(selectedCompanyId), serializeCareerPilotProfile(profile));
      setProfileStorageError(null);
    } catch (error) {
      setProfileStorageError(error instanceof Error
        ? `Could not save your profile in this browser: ${error.message}`
        : "Could not save your profile in this browser.");
    }
  }, [profile, profileDirty, profileReady, selectedCompanyId]);

  useEffect(() => {
    let active = true;
    if (!selectedCompanyId) {
      setDiscoveredJobs([]);
      setLoadingJobs(false);
      setJobsError(null);
      setSourceResults([]);
      setSearchStatus(null);
      setSearchingJobs(false);
      return () => { active = false; };
    }
    setDiscoveredJobs([]);
    setJobsError(null);
    setSourceResults([]);
    setSearchStatus(null);
    setSearchingJobs(false);
    setLoadingJobs(true);
    careerPilotJobsApi.list(selectedCompanyId).then((response) => {
      if (!active) return;
      setDiscoveredJobs(response.jobs);
      setJobsError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setJobsError(error instanceof Error ? error.message : "Could not load saved job listings.");
    }).finally(() => {
      if (active) setLoadingJobs(false);
    });
    return () => { active = false; };
  }, [selectedCompanyId]);

  function startResearch() {
    try {
      const task = buildCareerPilotTask({
        role,
        location,
        instructions,
        candidateProfile: profile,
        includeCandidateProfile: includeProfile,
      });
      setValidationError(null);
      openNewIssue({
        title: task.title,
        description: task.description,
        assigneeAgentId: primaryAgent?.primaryAgentId ?? undefined,
        navigateOnCreate: true,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Could not prepare the job research task.");
    }
  }

  function updateProfile<K extends keyof CareerPilotProfile>(field: K, value: CareerPilotProfile[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
    setProfileDirty(true);
  }

  function clearProfile() {
    setProfile({ ...EMPTY_CAREERPILOT_PROFILE });
    setIncludeProfile(false);
    setProfileDirty(true);
  }

  function buildSearchInput(): CareerPilotJobSearchInput {
    const parseSalary = (value: string, label: string) => {
      if (!value.trim()) return undefined;
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a non-negative number.`);
      return amount;
    };
    const input: CareerPilotJobSearchInput = {
      role,
      location,
      workArrangement,
      careerStage,
      experience: experience.trim(),
      preferredCompanies: preferredCompanies.split(",").map((company) => company.trim()).filter(Boolean),
    };
    const minimum = parseSalary(minSalary, "Minimum salary");
    const maximum = parseSalary(maxSalary, "Maximum salary");
    if (minimum !== undefined) input.minSalary = minimum;
    if (maximum !== undefined) input.maxSalary = maximum;
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new Error("Minimum salary must not be greater than maximum salary.");
    }
    return input;
  }

  async function searchLiveJobs() {
    if (!selectedCompanyId) return;
    const companyId = selectedCompanyId;
    setSearchingJobs(true);
    setJobsError(null);
    setSourceResults([]);
    setSearchStatus(null);
    try {
      const response = await careerPilotJobsApi.search(companyId, buildSearchInput());
      if (selectedCompanyIdRef.current === companyId) {
        setSourceResults(response.sources);
        setSearchStatus(response.status);
        if (response.status === "failed") {
          setJobsError(response.message ?? "No configured job source completed successfully.");
        } else {
          setDiscoveredJobs(response.jobs);
        }
      }
    } catch (error) {
      if (selectedCompanyIdRef.current === companyId) {
        setJobsError(error instanceof Error ? error.message : "Could not search job sources.");
      }
    } finally {
      if (selectedCompanyIdRef.current === companyId) setSearchingJobs(false);
    }
  }

  function prepareApplication(job: CareerPilotJobListing) {
    const task = buildCareerPilotApplicationPrepTask(job, profile, includeProfile);
    openNewIssue({
      title: task.title,
      description: task.description,
      assigneeAgentId: primaryAgent?.primaryAgentId ?? undefined,
      navigateOnCreate: true,
    });
  }

  async function updateJobStatus(job: CareerPilotJobListing, status: CareerPilotJobStatusUpdate["status"]) {
    if (!selectedCompanyId) return;
    setUpdatingJobId(job.id);
    setJobsError(null);
    try {
      const response = await careerPilotJobsApi.updateStatus(selectedCompanyId, job.id, { status });
      if (selectedCompanyIdRef.current === selectedCompanyId) {
        setDiscoveredJobs((current) => current.map((item) => item.id === job.id ? response.job : item));
      }
    } catch (error) {
      if (selectedCompanyIdRef.current === selectedCompanyId) {
        setJobsError(error instanceof Error ? error.message : "Could not update the application tracker.");
      }
    } finally {
      if (selectedCompanyIdRef.current === selectedCompanyId) setUpdatingJobId(null);
    }
  }

  const shortlistedCount = discoveredJobs.filter((job) => job.workflowStatus === "shortlisted").length;
  const preparedCount = discoveredJobs.filter((job) =>
    job.workflowStatus === "application_prepared" || job.workflowStatus === "awaiting_approval").length;
  const submittedCount = discoveredJobs.filter((job) => job.workflowStatus === "submitted").length;
  const failedCount = discoveredJobs.filter((job) => job.workflowStatus === "failed").length;
  const rankedJobs = discoveredJobs
    .map((job) => ({ job, match: assessCareerPilotListing(job, profile) }))
    .sort((left, right) => (right.match.score ?? -1) - (left.match.score ?? -1));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">CareerPilot AI</p>
            <h1 className="text-2xl font-semibold tracking-tight">Job search and application prep</h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Search configured Greenhouse, Lever, Ashby, Adzuna, and SearXNG sources. Public listings are saved per
          workspace; source errors and missing facts remain visible instead of being guessed.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchCheck className="size-4" aria-hidden="true" />
            Start a career search
          </CardTitle>
          <CardDescription>
            Your request becomes a normal, auditable agent task. Attach your resume in the task composer before starting.
            Configure public board IDs and SearXNG in the server environment; see the project .env.example.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Job role
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                maxLength={120}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Country, city, or remote preference
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={120}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              Work arrangement
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={workArrangement}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "any" || value === "remote" || value === "hybrid" || value === "onsite") {
                    setWorkArrangement(value);
                  }
                }}
              >
                <option value="any">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Career stage
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={careerStage}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "any" || value === "fresher" || value === "internship" || value === "entry-level") {
                    setCareerStage(value);
                  }
                }}
              >
                <option value="any">Any level</option>
                <option value="fresher">Fresher / graduate</option>
                <option value="internship">Internship</option>
                <option value="entry-level">Entry level</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Experience preference
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
                placeholder="e.g. 0–2 years"
                maxLength={120}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Minimum salary (INR/year; unknown salaries stay included)
              <input
                type="number"
                min="0"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={minSalary}
                onChange={(event) => setMinSalary(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Maximum salary (INR/year; unknown salaries stay included)
              <input
                type="number"
                min="0"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={maxSalary}
                onChange={(event) => setMaxSalary(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Preferred companies (optional)
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={preferredCompanies}
                onChange={(event) => setPreferredCompanies(event.target.value)}
                placeholder="Comma-separated names"
                maxLength={1_000}
              />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            What should CareerPilot do?
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="min-h-36"
              maxLength={8_000}
            />
          </label>

          {validationError ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {validationError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {primaryAgent?.primaryAgent
                ? `Assigned to your primary agent: ${primaryAgent.primaryAgent.name}`
                : "Choose an agent in the task composer."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={searchLiveJobs} disabled={!selectedCompanyId || searchingJobs}>
                {searchingJobs ? "Searching configured sources..." : "Search live jobs"}
                <SearchCheck className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" onClick={startResearch} disabled={!selectedCompanyId}>
                Prepare agent task
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {sourceResults.length > 0 ? (
            <div className="space-y-2 border-t pt-4" aria-live="polite">
              <p className="text-sm font-medium">
                Search status: {searchStatus === "partial" ? "Partial results" : searchStatus === "failed" ? "Failed" : "Complete"}
              </p>
              <ul className="grid gap-2 text-xs sm:grid-cols-2">
                {sourceResults.map((source) => (
                  <li key={source.source} className="rounded-md border px-3 py-2">
                    <span className="font-medium">{formatSourceName(source.source)}</span>
                    <span className="text-muted-foreground"> · {source.status} · {source.count} jobs</span>
                    {source.message ? <p className="mt-1 text-muted-foreground">{source.message}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusiness className="size-4" aria-hidden="true" />
            Discovered jobs
          </CardTitle>
          <CardDescription>
            Public source results are de-duplicated and saved per workspace. Keyword overlap is not an eligibility decision.
            Tracker preparation states are user-managed; this build cannot submit an application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {jobsError ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {jobsError}
            </p>
          ) : null}
          {loadingJobs ? <p className="text-sm text-muted-foreground">Loading saved listings...</p> : null}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <TrackerCount label="Discovered" count={discoveredJobs.length} />
            <TrackerCount label="Shortlisted" count={shortlistedCount} />
            <TrackerCount label="Prepared" count={preparedCount} />
            <TrackerCount label="Submitted" count={submittedCount} />
            <TrackerCount label="Failed" count={failedCount} />
          </dl>
          {!loadingJobs && discoveredJobs.length === 0 && !jobsError ? (
            <p className="text-sm text-muted-foreground">No saved listings yet. Search for current openings above.</p>
          ) : null}
          {rankedJobs.map(({ job, match }, index) => (
            <article key={job.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-medium">{job.title}</h2>
                  <p className="text-sm text-muted-foreground">{job.company || "Company not listed"} · {job.location || "Location not listed"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatSourceName(job.provider)} · {formatWorkflowStatus(job.workflowStatus)}
                    {job.workplaceType ? ` · ${job.workplaceType}` : ""}
                    {job.employmentType ? ` · ${job.employmentType}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {match.score === null ? "Match rank unavailable" : `Match rank ${index + 1}`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{formatSalary(job)}</p>
              </div>
              <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  Profile keyword overlap: {match.score === null ? "Not calculated" : `${match.score}%`}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">{match.explanation}</p>
                {match.matchingSkills.length ? (
                  <p className="text-xs"><span className="font-medium">Found in profile:</span> {match.matchingSkills.join(", ")}</p>
                ) : null}
                {match.missingSkills.length ? (
                  <p className="text-xs"><span className="font-medium">Not shown in profile:</span> {match.missingSkills.join(", ")}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">Eligibility: not verified.</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {job.postedAt ? <span>Posted {new Date(job.postedAt).toLocaleDateString()}</span> : <span>Posting date not supplied</span>}
                <span>Last checked {new Date(job.lastSeenAt).toLocaleDateString()}</span>
                <span>Verification: {job.verificationStatus.replace(/_/g, " ")}</span>
                {job.sourceUrl ? (
                  <a
                    href={job.officialApplicationUrl ?? job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
                  >
                    {job.officialApplicationUrl ? "Open official application" : "Open source listing"}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : <span>Source link unavailable</span>}
              </div>
              {job.description ? (
                <details className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">View job description</summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{job.description}</p>
                  {job.verificationStatus === "search_snippet" ? (
                    <p className="mt-2 text-xs text-muted-foreground">Search engine snippet only; open the source for the full listing.</p>
                  ) : null}
                </details>
              ) : <p className="text-sm text-muted-foreground">The source did not provide a job description.</p>}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updatingJobId === job.id}
                  onClick={() => updateJobStatus(job, job.workflowStatus === "shortlisted" ? "discovered" : "shortlisted")}
                >
                  {job.workflowStatus === "shortlisted" ? "Remove shortlist" : "Shortlist"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => prepareApplication(job)}>
                  Prepare with agent
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updatingJobId === job.id}
                  onClick={() => updateJobStatus(job, "application_prepared")}
                >
                  Mark prepared
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updatingJobId === job.id || job.workflowStatus !== "application_prepared"}
                  onClick={() => updateJobStatus(job, "awaiting_approval")}
                >
                  Awaiting approval
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={updatingJobId === job.id}
                  onClick={() => updateJobStatus(job, "rejected")}
                >
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden="true" />
            Candidate profile
          </CardTitle>
          <CardDescription>
            Add facts to help assess fresher eligibility and job fit. Do not enter contact details or other sensitive information here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField label="Education and specialization" value={profile.education} onChange={(value) => updateProfile("education", value)} />
            <ProfileField label="Graduation year" value={profile.graduationYear} onChange={(value) => updateProfile("graduationYear", value)} />
            <ProfileField label="Technical skills" value={profile.skills} onChange={(value) => updateProfile("skills", value)} multiline />
            <ProfileField label="Projects" value={profile.projects} onChange={(value) => updateProfile("projects", value)} multiline />
            <ProfileField label="Preferred roles" value={profile.preferredRoles} onChange={(value) => updateProfile("preferredRoles", value)} />
            <ProfileField label="Preferred locations" value={profile.preferredLocations} onChange={(value) => updateProfile("preferredLocations", value)} />
            <ProfileField label="Salary expectations (optional)" value={profile.salaryExpectation} onChange={(value) => updateProfile("salaryExpectation", value)} />
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2 text-sm leading-5">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={includeProfile}
                onChange={(event) => setIncludeProfile(event.target.checked)}
              />
              Include these profile details in the agent task
            </label>
            <Button type="button" variant="outline" size="sm" onClick={clearProfile} disabled={!hasCareerPilotProfileContent(profile)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Clear profile
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {profileStorageError ?? "Profile is saved in this browser only, scoped to the selected workspace. It is not encrypted or synced to your account. Details are shared with an agent only when you check the box and create a task."}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4" aria-hidden="true" />
              What to attach
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
            Attach your master resume to the task. The agent is instructed to use only facts in that resume, identify
            missing eligibility evidence, and prepare a tailored cover letter without inventing experience.
          </CardContent>
        </Card>
        <Card className="gap-3 border-amber-500/30 bg-amber-500/5 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CircleAlert className="size-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              Human approval stays in control
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
            This workflow searches configured public sources, creates reviewable agent tasks, and tracks shortlist and
            preparation states. It does not submit applications. Review every job, cover letter, and answer yourself.
            Agents need a configured model for document preparation. Configure connections in{" "}
            <Link to="/apps" className="font-medium text-foreground underline underline-offset-4">Apps</Link>.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatSalary(job: CareerPilotJobListing): string {
  if (job.salaryMin === null && job.salaryMax === null) return "Salary not listed";
  const currency = job.salaryCurrency && /^[A-Z]{3}$/.test(job.salaryCurrency) ? job.salaryCurrency : null;
  const format = (amount: number) => currency
    ? new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
    : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)} (${job.salaryCurrency === "UNKNOWN" ? "currency unconfirmed" : "currency not listed"})`;
  const interval = job.salaryInterval ? ` / ${job.salaryInterval.toLowerCase()}` : "";
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return `${format(job.salaryMin)}–${format(job.salaryMax)}${interval}${job.salaryIsPredicted ? " (estimated)" : ""}`;
  }
  const amount = job.salaryMin ?? job.salaryMax;
  if (amount === null) return "Salary not listed";
  return `${format(amount)}${interval}${job.salaryIsPredicted ? " (estimated)" : ""}`;
}

function formatSourceName(source: CareerPilotJobListing["provider"] | CareerPilotJobSourceResult["source"]): string {
  const names: Record<typeof source, string> = {
    adzuna: "Adzuna",
    greenhouse: "Greenhouse",
    lever: "Lever",
    ashby: "Ashby",
    searxng: "SearXNG",
  };
  return names[source];
}

function formatWorkflowStatus(status: CareerPilotJobWorkflowStatus): string {
  const labels: Record<CareerPilotJobWorkflowStatus, string> = {
    discovered: "Discovered",
    shortlisted: "Shortlisted",
    application_prepared: "Application prepared",
    awaiting_approval: "Awaiting approval",
    submitted: "Submitted",
    failed: "Failed",
    rejected: "Rejected",
  };
  return labels[status];
}

function TrackerCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{count}</dd>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm font-medium">
      {label}
      {multiline ? (
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={4_000} />
      ) : (
        <input
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={4_000}
        />
      )}
    </label>
  );
}
