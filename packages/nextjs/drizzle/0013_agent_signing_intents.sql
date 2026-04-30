CREATE TABLE IF NOT EXISTS "agent_signing_intents" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL,
  "chain_id" integer,
  "client_request_id" text,
  "payment_mode" text NOT NULL,
  "wallet_address" text,
  "operation_key" text,
  "payload_hash" text,
  "request_body" text NOT NULL,
  "transaction_hashes" text,
  "error" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_signing_intents_token_hash_unique" ON "agent_signing_intents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_signing_intents_status_expires_idx" ON "agent_signing_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_signing_intents_operation_key_idx" ON "agent_signing_intents" USING btree ("operation_key");
