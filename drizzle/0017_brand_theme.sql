ALTER TABLE "schools" ADD COLUMN "brand_color" text;--> statement-breakpoint
UPDATE "plans" SET "features" = "features" || '["brand_theme"]'::jsonb WHERE "key" IN ('premium', 'enterprise') AND NOT ("features" ? 'brand_theme');
