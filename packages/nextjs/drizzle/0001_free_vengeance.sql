CREATE TABLE "x402_question_submissions" (
	"operation_key" text PRIMARY KEY NOT NULL,
	"client_request_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"chain_id" integer NOT NULL,
	"payer_address" text,
	"payment_asset" text NOT NULL,
	"payment_amount" text NOT NULL,
	"bounty_amount" text NOT NULL,
	"service_fee_amount" text NOT NULL,
	"status" text NOT NULL,
	"content_id" text,
	"reward_pool_id" text,
	"transaction_hashes" text,
	"payment_receipt" text,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "x402_question_submissions_client_request_unique" ON "x402_question_submissions" USING btree ("chain_id","client_request_id");--> statement-breakpoint
CREATE INDEX "x402_question_submissions_status_updated_idx" ON "x402_question_submissions" USING btree ("status","updated_at");