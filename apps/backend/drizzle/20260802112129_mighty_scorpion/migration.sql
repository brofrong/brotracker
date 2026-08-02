CREATE TABLE "transfer_daily_snapshots" (
	"day" date PRIMARY KEY,
	"downloaded_bytes" bigint NOT NULL,
	"uploaded_bytes" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_speed_samples" (
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"download_speed" bigint NOT NULL,
	"upload_speed" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "transfer_speed_samples_sampled_at_idx" ON "transfer_speed_samples" ("sampled_at");