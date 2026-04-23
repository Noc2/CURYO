CREATE TABLE "agent_callback_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"callback_url" text NOT NULL,
	"secret" text NOT NULL,
	"event_types" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_callback_subscriptions_agent_url_unique" ON "agent_callback_subscriptions" USING btree ("agent_id","callback_url");
--> statement-breakpoint
CREATE INDEX "agent_callback_subscriptions_agent_status_idx" ON "agent_callback_subscriptions" USING btree ("agent_id","status");
--> statement-breakpoint
CREATE TABLE "agent_callback_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"event_type" text NOT NULL,
	"callback_url" text NOT NULL,
	"secret" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_callback_events_event_key_unique" ON "agent_callback_events" USING btree ("event_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_callback_events_subscription_event_unique" ON "agent_callback_events" USING btree ("subscription_id","event_id");
--> statement-breakpoint
CREATE INDEX "agent_callback_events_status_next_attempt_idx" ON "agent_callback_events" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "agent_callback_events_lease_expires_idx" ON "agent_callback_events" USING btree ("lease_expires_at");
--> statement-breakpoint
CREATE INDEX "agent_callback_events_agent_event_idx" ON "agent_callback_events" USING btree ("agent_id","event_type");
