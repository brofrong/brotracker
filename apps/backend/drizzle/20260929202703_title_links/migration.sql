CREATE TABLE "title_links" (
	"key" text PRIMARY KEY,
	"title_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
