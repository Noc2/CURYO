ALTER TABLE "content_feedback" ADD COLUMN "chain_id" integer;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD COLUMN "feedback_hash" text;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD COLUMN "client_nonce" text;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD COLUMN "payload_signature" text;--> statement-breakpoint
CREATE UNIQUE INDEX "content_feedback_feedback_hash_unique" ON "content_feedback" USING btree ("feedback_hash");