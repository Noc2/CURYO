CREATE TABLE "mcp_agent_daily_budget_usage" (
	"budget_key" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"budget_date" text NOT NULL,
	"reserved_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_agent_daily_budget_usage_agent_day_idx" ON "mcp_agent_daily_budget_usage" USING btree ("agent_id","budget_date");
