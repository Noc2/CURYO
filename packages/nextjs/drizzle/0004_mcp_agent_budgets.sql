CREATE TABLE "mcp_agent_budget_reservations" (
	"operation_key" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"chain_id" integer NOT NULL,
	"category_id" text NOT NULL,
	"payment_amount" text NOT NULL,
	"status" text NOT NULL,
	"content_id" text,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_agent_budget_reservations_client_request_unique" ON "mcp_agent_budget_reservations" USING btree ("agent_id","chain_id","client_request_id");--> statement-breakpoint
CREATE INDEX "mcp_agent_budget_reservations_agent_status_created_idx" ON "mcp_agent_budget_reservations" USING btree ("agent_id","status","created_at");
