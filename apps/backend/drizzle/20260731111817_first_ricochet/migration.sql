CREATE TABLE "torrents" (
	"torrent_id" text PRIMARY KEY,
	"title" text NOT NULL,
	"title_norm" text NOT NULL,
	"category" text NOT NULL,
	"forum_id" text NOT NULL,
	"author_id" text NOT NULL,
	"size" bigint NOT NULL,
	"seeds" integer NOT NULL,
	"leeches" integer NOT NULL,
	"downloads" integer NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"torrent_file_url" text NOT NULL,
	"topic_url" text NOT NULL,
	"hdr" text,
	"resolution" text,
	"image_key" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX torrents_title_norm_trgm_idx ON torrents USING gin (title_norm gin_trgm_ops);
