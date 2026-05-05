ALTER TABLE "x402_question_submissions" ADD COLUMN "bundle_id" text;--> statement-breakpoint
ALTER TABLE "x402_question_submissions" ADD COLUMN "content_ids" text;--> statement-breakpoint
ALTER TABLE "x402_question_submissions" ADD COLUMN "question_count" integer DEFAULT 1 NOT NULL;
