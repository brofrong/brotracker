/**
 * Stub Better Auth schema — regenerated in Task 3 via `bun x auth@latest generate`.
 */
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull(),
	image: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

export const session = pgTable("session", {
	id: text().primaryKey(),
	userId: text().notNull(),
	token: text().notNull().unique(),
	expiresAt: timestamp().notNull(),
	ipAddress: text(),
	userAgent: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

export const account = pgTable("account", {
	id: text().primaryKey(),
	userId: text().notNull(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	accessToken: text(),
	refreshToken: text(),
	accessTokenExpiresAt: timestamp(),
	refreshTokenExpiresAt: timestamp(),
	scope: text(),
	idToken: text(),
	password: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

export const verification = pgTable("verification", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp().notNull(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});
