CREATE TABLE "mcp_agent_ask_audit_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_key" text NOT NULL,
	"agent_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"chain_id" integer NOT NULL,
	"category_id" text NOT NULL,
	"payment_amount" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"content_id" text,
	"error" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_agent_ask_audit_records_agent_created_idx" ON "mcp_agent_ask_audit_records" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_agent_ask_audit_records_operation_created_idx" ON "mcp_agent_ask_audit_records" USING btree ("operation_key","created_at");
