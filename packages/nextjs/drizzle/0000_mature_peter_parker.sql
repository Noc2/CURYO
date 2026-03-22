CREATE TABLE "api_rate_limit_maintenance" (
	"name" text PRIMARY KEY NOT NULL,
	"last_cleanup_started_at" bigint NOT NULL,
	"lease_expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"request_count" integer NOT NULL,
	"window_started_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"title" text,
	"description" text,
	"image_url" text,
	"authors" text,
	"release_year" text,
	"symbol" text,
	"stars" integer,
	"forks" integer,
	"language" text,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_metadata_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "free_transaction_quotas" (
	"identity_key" text PRIMARY KEY NOT NULL,
	"voter_id_token_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"environment" text NOT NULL,
	"last_wallet_address" text NOT NULL,
	"free_tx_limit" integer NOT NULL,
	"free_tx_used" integer NOT NULL,
	"exhausted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_transaction_reservations" (
	"operation_key" text PRIMARY KEY NOT NULL,
	"identity_key" text NOT NULL,
	"voter_id_token_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"environment" text NOT NULL,
	"wallet_address" text NOT NULL,
	"status" text NOT NULL,
	"tx_hashes" text,
	"reserved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_email_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"email" text NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"content_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_email_delivery_leases" (
	"event_key" text PRIMARY KEY NOT NULL,
	"lease_expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_email_subscriptions" (
	"wallet_address" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_token" text,
	"verification_expires_at" timestamp with time zone,
	"round_resolved" boolean NOT NULL,
	"settling_soon_hour" boolean NOT NULL,
	"settling_soon_day" boolean NOT NULL,
	"followed_submission" boolean NOT NULL,
	"followed_resolution" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"wallet_address" text PRIMARY KEY NOT NULL,
	"round_resolved" boolean NOT NULL,
	"settling_soon_hour" boolean NOT NULL,
	"settling_soon_day" boolean NOT NULL,
	"followed_submission" boolean NOT NULL,
	"followed_resolution" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_address" text NOT NULL,
	"target_address" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_action_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"action" text NOT NULL,
	"payload_hash" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_read_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_write_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "url_validations" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"is_valid" boolean NOT NULL,
	"platform" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "url_validations_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "watched_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"content_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_rate_limits_expires_at_idx" ON "api_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "free_transaction_quotas_token_chain_env_unique" ON "free_transaction_quotas" USING btree ("voter_id_token_id","chain_id","environment");--> statement-breakpoint
CREATE INDEX "free_transaction_quotas_chain_updated_at_idx" ON "free_transaction_quotas" USING btree ("chain_id","updated_at");--> statement-breakpoint
CREATE INDEX "free_transaction_reservations_identity_status_expires_idx" ON "free_transaction_reservations" USING btree ("identity_key","status","expires_at");--> statement-breakpoint
CREATE INDEX "free_transaction_reservations_wallet_status_updated_idx" ON "free_transaction_reservations" USING btree ("wallet_address","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_email_deliveries_event_key_unique" ON "notification_email_deliveries" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_email_subscriptions_email_unique" ON "notification_email_subscriptions" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_email_subscriptions_token_unique" ON "notification_email_subscriptions" USING btree ("verification_token");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_follows_follower_target_unique" ON "profile_follows" USING btree ("follower_address","target_address");--> statement-breakpoint
CREATE INDEX "profile_follows_follower_created_at_idx" ON "profile_follows" USING btree ("follower_address","created_at");--> statement-breakpoint
CREATE INDEX "profile_follows_target_created_at_idx" ON "profile_follows" USING btree ("target_address","created_at");--> statement-breakpoint
CREATE INDEX "signed_action_challenges_expires_at_idx" ON "signed_action_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signed_action_challenges_wallet_action_idx" ON "signed_action_challenges" USING btree ("wallet_address","action");--> statement-breakpoint
CREATE INDEX "signed_read_sessions_wallet_scope_expires_idx" ON "signed_read_sessions" USING btree ("wallet_address","scope","expires_at");--> statement-breakpoint
CREATE INDEX "signed_write_sessions_wallet_scope_expires_idx" ON "signed_write_sessions" USING btree ("wallet_address","scope","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_content_wallet_content_unique" ON "watched_content" USING btree ("wallet_address","content_id");--> statement-breakpoint
CREATE INDEX "watched_content_wallet_created_at_idx" ON "watched_content" USING btree ("wallet_address","created_at");