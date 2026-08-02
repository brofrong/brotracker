CREATE TABLE "title_watch_events" (
	"id" text PRIMARY KEY,
	"title_id" text,
	"topic_url" text NOT NULL,
	"kind" text NOT NULL,
	"message" text,
	"previous_size" bigint,
	"new_size" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "title_watch_events_created_at_idx" ON "title_watch_events" ("created_at");