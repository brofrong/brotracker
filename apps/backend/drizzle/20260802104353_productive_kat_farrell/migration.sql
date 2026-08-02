CREATE TABLE "title_watches" (
	"topic_url" text PRIMARY KEY,
	"title_id" text,
	"watch" text NOT NULL,
	"source" text NOT NULL,
	"size" bigint,
	"registered_at" timestamp with time zone,
	"content_hash" text,
	"qb_hash" text,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
