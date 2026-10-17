ALTER TABLE "title_watches" ADD COLUMN "id" text;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "kind" text;--> statement-breakpoint
UPDATE "title_watches" SET "id" = gen_random_uuid()::text, "kind" = 'tv';--> statement-breakpoint
ALTER TABLE "title_watches" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "title_watches" DROP CONSTRAINT "title_watches_pkey";--> statement-breakpoint
ALTER TABLE "title_watches" ADD CONSTRAINT "title_watches_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "title_watches" ALTER COLUMN "topic_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "title_watches" ADD CONSTRAINT "title_watches_topic_url_unique" UNIQUE("topic_url");--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "season" integer;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "title_name" text;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "poster" text;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "waiting_outcome" text;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "waiting_outcome_detail" text;--> statement-breakpoint
ALTER TABLE "title_watches" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "title_watch_events" ALTER COLUMN "topic_url" DROP NOT NULL;
