CREATE TABLE "worker_runs" (
	"id" text PRIMARY KEY,
	"worker_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" text,
	"error" text,
	"log" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "worker_runs_worker_id_started_at_idx" ON "worker_runs" ("worker_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_runs_one_running_per_worker" ON "worker_runs" ("worker_id") WHERE "status" = 'running';