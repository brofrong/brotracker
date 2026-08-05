CREATE TABLE "kinozal_store" (
	"id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

UPDATE torrents
SET torrent_id = 'rutracker:' || torrent_id
WHERE torrent_id !~ '^(rutracker|kinozal):';

UPDATE torrents
SET image_key = 'covers/rutracker:' || substr(image_key, 8)
WHERE image_key LIKE 'covers/%'
  AND image_key !~ '^covers/(rutracker|kinozal):';
