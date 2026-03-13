CREATE TABLE `api_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`request_count` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`title` text,
	`description` text,
	`image_url` text,
	`authors` text,
	`release_year` text,
	`symbol` text,
	`stars` integer,
	`forks` integer,
	`language` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_metadata_url_unique` ON `content_metadata` (`url`);--> statement-breakpoint
CREATE TABLE `signed_action_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_address` text NOT NULL,
	`action` text NOT NULL,
	`payload_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `url_validations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`is_valid` integer NOT NULL,
	`platform` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `url_validations_url_unique` ON `url_validations` (`url`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`username` text NOT NULL,
	`profile_image_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_wallet_address_unique` ON `user_profiles` (`wallet_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_username_unique` ON `user_profiles` (`username`);
