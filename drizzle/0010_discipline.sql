CREATE TABLE "behaviour_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid,
	"class_id" uuid,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"severity" text,
	"points" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"action_taken" text,
	"occurred_on" date NOT NULL,
	"status" text DEFAULT 'resolved' NOT NULL,
	"parent_notified_at" timestamp with time zone,
	"recorded_by" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "discipline_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_resolved_by_memberships_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "behaviour_student_idx" ON "behaviour_records" USING btree ("student_id","occurred_on");--> statement-breakpoint
CREATE INDEX "behaviour_school_term_idx" ON "behaviour_records" USING btree ("school_id","term_id","kind");