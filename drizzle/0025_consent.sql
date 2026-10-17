ALTER TABLE "applicants" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "terms_accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_terms_accepted_by_users_id_fk" FOREIGN KEY ("terms_accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;