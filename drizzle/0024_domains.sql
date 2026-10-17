ALTER TABLE "schools" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "domain_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "schools_custom_domain_uq" ON "schools" USING btree (lower("custom_domain"));