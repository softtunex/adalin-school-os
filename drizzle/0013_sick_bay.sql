CREATE TABLE "sick_bay_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complaint" text NOT NULL,
	"temperature" integer,
	"observations" text,
	"treatment" text,
	"medicines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text,
	"left_at" timestamp with time zone,
	"parents_told" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regular_medication" text,
	"emergency_note" text,
	"doctor" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "health_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_updated_by_memberships_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sick_bay_visits_student_idx" ON "sick_bay_visits" USING btree ("student_id","arrived_at");--> statement-breakpoint
CREATE INDEX "sick_bay_visits_school_idx" ON "sick_bay_visits" USING btree ("school_id","arrived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_health_student_uq" ON "student_health" USING btree ("student_id");