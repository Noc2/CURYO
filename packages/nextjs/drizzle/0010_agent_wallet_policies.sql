CREATE TABLE "agent_wallet_policies" (
  "id" text PRIMARY KEY,
  "owner_wallet_address" text NOT NULL,
  "agent_id" text NOT NULL,
  "agent_wallet_address" text NOT NULL,
  "status" text NOT NULL,
  "scopes" text NOT NULL,
  "categories" text,
  "daily_budget_atomic" text NOT NULL,
  "per_ask_limit_atomic" text NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallet_policies_owner_agent_unique"
ON "agent_wallet_policies" ("owner_wallet_address", "agent_id");
--> statement-breakpoint
CREATE INDEX "agent_wallet_policies_owner_status_idx"
ON "agent_wallet_policies" ("owner_wallet_address", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX "agent_wallet_policies_agent_wallet_idx"
ON "agent_wallet_policies" ("agent_wallet_address", "status");
--> statement-breakpoint
CREATE TABLE "agent_wallet_policy_audit_records" (
  "id" serial PRIMARY KEY,
  "policy_id" text NOT NULL,
  "owner_wallet_address" text NOT NULL,
  "agent_id" text NOT NULL,
  "agent_wallet_address" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL,
  "details" text,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_wallet_policy_audit_policy_created_idx"
ON "agent_wallet_policy_audit_records" ("policy_id", "created_at");
--> statement-breakpoint
CREATE INDEX "agent_wallet_policy_audit_owner_created_idx"
ON "agent_wallet_policy_audit_records" ("owner_wallet_address", "created_at");
