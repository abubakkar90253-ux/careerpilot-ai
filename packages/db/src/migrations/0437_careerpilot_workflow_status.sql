ALTER TABLE "careerpilot_jobs" ADD COLUMN "workplace_type" text;
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ADD COLUMN "employment_type" text;
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ADD COLUMN "salary_interval" text;
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ALTER COLUMN "salary_currency" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ADD COLUMN "workflow_status" text DEFAULT 'discovered' NOT NULL;
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ADD CONSTRAINT "careerpilot_jobs_workflow_status_check"
  CHECK ("workflow_status" IN ('discovered', 'shortlisted', 'application_prepared', 'awaiting_approval', 'submitted', 'failed', 'rejected'));
