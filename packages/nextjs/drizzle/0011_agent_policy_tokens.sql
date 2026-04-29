ALTER TABLE "agent_wallet_policies"
ADD COLUMN "token_hash" text;
--> statement-breakpoint
ALTER TABLE "agent_wallet_policies"
ADD COLUMN "token_issued_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agent_wallet_policies"
ADD COLUMN "token_revoked_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallet_policies_token_hash_unique"
ON "agent_wallet_policies" ("token_hash");
