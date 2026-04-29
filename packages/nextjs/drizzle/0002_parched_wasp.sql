CREATE TABLE "content_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"round_id" text,
	"author_address" text NOT NULL,
	"feedback_type" text NOT NULL,
	"body" text NOT NULL,
	"source_url" text,
	"moderation_status" text DEFAULT 'approved' NOT NULL,
	"visibility_status" text DEFAULT 'hidden_until_settlement' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "content_feedback_content_created_at_idx" ON "content_feedback" USING btree ("content_id","created_at");--> statement-breakpoint
CREATE INDEX "content_feedback_content_round_idx" ON "content_feedback" USING btree ("content_id","round_id");--> statement-breakpoint
CREATE INDEX "content_feedback_author_created_at_idx" ON "content_feedback" USING btree ("author_address","created_at");