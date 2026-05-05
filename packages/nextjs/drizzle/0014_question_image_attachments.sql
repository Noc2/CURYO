CREATE TABLE "question_image_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "uploader_kind" text NOT NULL,
  "owner_wallet_address" text,
  "agent_id" text,
  "client_request_id" text,
  "operation_key" text,
  "content_id" text,
  "original_blob_pathname" text,
  "original_blob_url" text,
  "normalized_blob_pathname" text,
  "normalized_blob_url" text,
  "original_filename" text NOT NULL,
  "mime_type" text DEFAULT '' NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "width" integer,
  "height" integer,
  "sha256" text,
  "status" text NOT NULL,
  "moderation_status" text DEFAULT 'pending' NOT NULL,
  "moderation_provider" text,
  "moderation_result" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "question_image_attachments_owner_status_created_idx"
ON "question_image_attachments" USING btree ("owner_wallet_address","status","created_at");
--> statement-breakpoint
CREATE INDEX "question_image_attachments_agent_status_created_idx"
ON "question_image_attachments" USING btree ("agent_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "question_image_attachments_operation_idx"
ON "question_image_attachments" USING btree ("operation_key");
--> statement-breakpoint
CREATE INDEX "question_image_attachments_content_idx"
ON "question_image_attachments" USING btree ("content_id");
