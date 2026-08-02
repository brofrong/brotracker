CREATE TABLE "watch_tasks" (
	"id" text PRIMARY KEY,
	"topic_url" text NOT NULL,
	"title_id" text,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "watch_tasks_topic_url_status_idx" ON "watch_tasks" ("topic_url","status");