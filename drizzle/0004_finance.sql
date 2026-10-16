CREATE TABLE "discount_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	"item_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"method" text NOT NULL,
	"vendor" text,
	"reference" text,
	"receipt_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"recorded_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_amounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid,
	"scheme_id" uuid,
	"description" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"class_id" uuid,
	"kind" text DEFAULT 'term' NOT NULL,
	"title" text NOT NULL,
	"due_on" date,
	"charges_kobo" bigint DEFAULT 0 NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"paid_kobo" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"pay_token" text NOT NULL,
	"issued_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"receipt_no" text NOT NULL,
	"paid_on" date NOT NULL,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"note" text,
	"payer_name" text,
	"recorded_by" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_discounts" (
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_discounts_student_id_scheme_id_pk" PRIMARY KEY("student_id","scheme_id")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "next_invoice_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "next_receipt_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "fee_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "paystack_subaccount" text;--> statement-breakpoint
ALTER TABLE "discount_schemes" ADD CONSTRAINT "discount_schemes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_schemes" ADD CONSTRAINT "discount_schemes_item_id_fee_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."fee_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_decided_by_memberships_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_amounts" ADD CONSTRAINT "fee_amounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_amounts" ADD CONSTRAINT "fee_amounts_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_amounts" ADD CONSTRAINT "fee_amounts_level_id_class_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."class_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_amounts" ADD CONSTRAINT "fee_amounts_item_id_fee_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."fee_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_item_id_fee_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."fee_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_scheme_id_discount_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."discount_schemes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_memberships_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_memberships_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_memberships_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_scheme_id_discount_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."discount_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_schemes_school_name_uq" ON "discount_schemes" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "expenses_school_spent_idx" ON "expenses" USING btree ("school_id","spent_on");--> statement-breakpoint
CREATE INDEX "expenses_school_status_idx" ON "expenses" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_amounts_uq" ON "fee_amounts" USING btree ("term_id","level_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_items_school_name_uq" ON "fee_items" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_school_number_uq" ON "invoices" USING btree ("school_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_pay_token_uq" ON "invoices" USING btree ("pay_token");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_term_student_uq" ON "invoices" USING btree ("term_id","student_id") WHERE kind = 'term' and status <> 'void';--> statement-breakpoint
CREATE INDEX "invoices_school_term_status_idx" ON "invoices" USING btree ("school_id","term_id","status");--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "invoices" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_reference_uq" ON "payment_intents" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_school_receipt_uq" ON "payments" USING btree ("school_id","receipt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_online_reference_uq" ON "payments" USING btree ("school_id","reference") WHERE method = 'paystack';--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_school_paid_on_idx" ON "payments" USING btree ("school_id","paid_on");--> statement-breakpoint
CREATE INDEX "student_discounts_scheme_idx" ON "student_discounts" USING btree ("scheme_id");