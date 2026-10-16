CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"gross_kobo" bigint DEFAULT 0 NOT NULL,
	"net_kobo" bigint DEFAULT 0 NOT NULL,
	"paye_kobo" bigint DEFAULT 0 NOT NULL,
	"pension_kobo" bigint DEFAULT 0 NOT NULL,
	"employer_pension_kobo" bigint DEFAULT 0 NOT NULL,
	"nhf_kobo" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"bank_name" text,
	"account_number" text,
	"account_name" text,
	"basic_kobo" bigint NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gross_kobo" bigint NOT NULL,
	"pension_kobo" bigint DEFAULT 0 NOT NULL,
	"employer_pension_kobo" bigint DEFAULT 0 NOT NULL,
	"nhf_kobo" bigint DEFAULT 0 NOT NULL,
	"paye_kobo" bigint DEFAULT 0 NOT NULL,
	"net_kobo" bigint NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_pay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"basic_kobo" bigint DEFAULT 0 NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pension" boolean DEFAULT true NOT NULL,
	"nhf" boolean DEFAULT false NOT NULL,
	"paye" boolean DEFAULT true NOT NULL,
	"annual_rent_kobo" bigint DEFAULT 0 NOT NULL,
	"bank_name" text,
	"account_number" text,
	"account_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "payroll_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_memberships_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay" ADD CONSTRAINT "staff_pay_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay" ADD CONSTRAINT "staff_pay_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_month_uq" ON "payroll_runs" USING btree ("school_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_run_member_uq" ON "payslips" USING btree ("run_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_member_uq" ON "staff_pay" USING btree ("membership_id");