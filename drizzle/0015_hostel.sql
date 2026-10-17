CREATE TABLE "exeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"leave_at" timestamp with time zone NOT NULL,
	"return_by" timestamp with time zone NOT NULL,
	"collected_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_user" uuid,
	"requested_by_staff" boolean DEFAULT false NOT NULL,
	"decided_by" uuid,
	"decision_note" text,
	"out_at" timestamp with time zone,
	"back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"bed" integer NOT NULL,
	"since" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"hostel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"beds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" text NOT NULL,
	"warden_id" uuid,
	"term_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "hostel_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_requested_by_user_users_id_fk" FOREIGN KEY ("requested_by_user") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_decided_by_memberships_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_warden_id_memberships_id_fk" FOREIGN KEY ("warden_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exeats_student_idx" ON "exeats" USING btree ("student_id","leave_at");--> statement-breakpoint
CREATE INDEX "exeats_school_status_idx" ON "exeats" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_beds_student_uq" ON "hostel_beds" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_beds_bed_uq" ON "hostel_beds" USING btree ("room_id","bed");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_rooms_name_uq" ON "hostel_rooms" USING btree ("hostel_id","name");