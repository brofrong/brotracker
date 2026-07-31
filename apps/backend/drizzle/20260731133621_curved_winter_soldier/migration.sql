CREATE TABLE "provider_settings" (
	"provider" text PRIMARY KEY,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
