ALTER TABLE "companies" ADD COLUMN "accent_color" text;
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#E11D48' WHERE "code" = 'CO01';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#92400E' WHERE "code" = 'CO02';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#059669' WHERE "code" = 'CO03';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#1D4ED8' WHERE "code" = 'CO04';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#7C3AED' WHERE "code" = 'CO05';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#DB2777' WHERE "code" = 'CO06';
--> statement-breakpoint
UPDATE "companies" SET "accent_color" = '#F59E0B' WHERE "code" = 'CO07';