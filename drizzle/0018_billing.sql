CREATE TABLE "platform_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"term_id" uuid,
	"period" text NOT NULL,
	"plan_key" text NOT NULL,
	"student_count" integer DEFAULT 0 NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_kobo" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_via" text,
	"reference" text,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "trial_return_plan_key" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "trial_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "pending_plan_key" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "read_only_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_invoices_number_uq" ON "platform_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_invoices_reference_uq" ON "platform_invoices" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "platform_invoices_school_idx" ON "platform_invoices" USING btree ("school_id","status");