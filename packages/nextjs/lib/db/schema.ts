import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletAddress: text("wallet_address").notNull().unique(), // lowercase address
  username: text("username").notNull().unique(), // 3-20 alphanumeric chars
  profileImageUrl: text("profile_image_url"), // optional external image URL
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentId: text("content_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export const urlValidations = sqliteTable("url_validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  isValid: integer("is_valid", { mode: "boolean" }).notNull(),
  platform: text("platform").notNull(), // "youtube", "wikipedia", "generic", etc.
  checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
});

export type UrlValidation = typeof urlValidations.$inferSelect;
