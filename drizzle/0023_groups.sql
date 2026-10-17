CREATE TABLE "school_group_admins" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_group_admins_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "school_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "school_group_admins" ADD CONSTRAINT "school_group_admins_group_id_school_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."school_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_group_admins" ADD CONSTRAINT "school_group_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_groups" ADD CONSTRAINT "school_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_group_admins_user_idx" ON "school_group_admins" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_group_id_school_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."school_groups"("id") ON DELETE set null ON UPDATE no action;