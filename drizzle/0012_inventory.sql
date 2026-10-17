CREATE TABLE "inventory_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"membership_id" uuid,
	"location" text,
	"assigned_on" date NOT NULL,
	"returned_on" date,
	"return_condition" text,
	"note" text,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'pieces' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"unit_cost_kobo" bigint DEFAULT 0 NOT NULL,
	"location" text,
	"tag" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"change" integer NOT NULL,
	"balance" integer NOT NULL,
	"unit_cost_kobo" bigint,
	"membership_id" uuid,
	"location" text,
	"supplier" text,
	"expense_id" uuid,
	"note" text,
	"moved_on" date NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "inventory_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_assignments" ADD CONSTRAINT "inventory_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_assignments" ADD CONSTRAINT "inventory_assignments_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_assignments" ADD CONSTRAINT "inventory_assignments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_assignments" ADD CONSTRAINT "inventory_assignments_assigned_by_memberships_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_assignments_open_idx" ON "inventory_assignments" USING btree ("school_id","returned_on");--> statement-breakpoint
CREATE INDEX "inventory_assignments_item_idx" ON "inventory_assignments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_assignments_member_idx" ON "inventory_assignments" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "inventory_items_name_idx" ON "inventory_items" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "inventory_moves_item_idx" ON "inventory_moves" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_moves_school_idx" ON "inventory_moves" USING btree ("school_id","moved_on");--> statement-breakpoint
INSERT INTO "roles" ("school_id", "key", "name", "description", "kind", "is_system", "permissions")
SELECT "id", 'storekeeper', 'Storekeeper', 'Store and assets. Stock in and out, assigning items to staff and rooms.', 'staff', true, '[]'::jsonb FROM "schools"
ON CONFLICT ("school_id", "key") DO NOTHING;
