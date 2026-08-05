CREATE TABLE "transfer_daily_speed_stats" (
	"day" date PRIMARY KEY,
	"min_download_speed" bigint,
	"max_download_speed" bigint,
	"sum_download_speed" bigint DEFAULT 0 NOT NULL,
	"active_download_samples" integer DEFAULT 0 NOT NULL,
	"min_upload_speed" bigint,
	"max_upload_speed" bigint,
	"sum_upload_speed" bigint DEFAULT 0 NOT NULL,
	"active_upload_samples" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
