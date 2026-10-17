CREATE TABLE "transport_riders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"stop" text NOT NULL,
	"direction" text DEFAULT 'both' NOT NULL,
	"started_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_id" uuid,
	"stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"term_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"trip_date" date NOT NULL,
	"direction" text NOT NULL,
	"boarded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plate" text,
	"capacity" integer NOT NULL,
	"driver_name" text,
	"driver_phone" text,
	"attendant_name" text,
	"attendant_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "transport_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_riders" ADD CONSTRAINT "transport_riders_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_riders" ADD CONSTRAINT "transport_riders_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_riders" ADD CONSTRAINT "transport_riders_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_transport_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_riders_student_uq" ON "transport_riders" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "transport_riders_route_idx" ON "transport_riders" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_trips_uq" ON "transport_trips" USING btree ("route_id","trip_date","direction");