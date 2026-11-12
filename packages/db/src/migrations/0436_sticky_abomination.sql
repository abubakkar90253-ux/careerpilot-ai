CREATE TABLE "careerpilot_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text DEFAULT 'adzuna' NOT NULL,
	"provider_job_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"salary_min" double precision,
	"salary_max" double precision,
	"salary_currency" text DEFAULT 'INR' NOT NULL,
	"salary_is_predicted" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone,
	"source_url" text,
	"official_application_url" text,
	"eligibility_notes" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"first_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "careerpilot_jobs" ADD CONSTRAINT "careerpilot_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "careerpilot_jobs_company_provider_job_uq" ON "careerpilot_jobs" USING btree ("company_id","provider","provider_job_id");--> statement-breakpoint
CREATE INDEX "careerpilot_jobs_company_last_seen_idx" ON "careerpilot_jobs" USING btree ("company_id","last_seen_at");