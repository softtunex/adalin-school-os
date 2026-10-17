CREATE TABLE "school_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoice_id" uuid,
	"delivered_at" timestamp with time zone,
	"note" text,
	"bought_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "extra_features" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "admin_grants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "admin_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "school_addons" ADD CONSTRAINT "school_addons_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_addons" ADD CONSTRAINT "school_addons_invoice_id_platform_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."platform_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_addons" ADD CONSTRAINT "school_addons_bought_by_memberships_id_fk" FOREIGN KEY ("bought_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_addons_school_idx" ON "school_addons" USING btree ("school_id","status");