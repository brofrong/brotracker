# Workers Admin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a durable Worker/WorkerRun registry with Postgres history and leveled logs, wire the nightly torrent checker into it (scheduled + manual), and ship `/workers` + `/workers/$id` UI.

**Architecture:** New `apps/backend/src/workers/` deep module (registry + runner + repository + thin tRPC). Nightly pipeline stays under `title/watch/`; workers call it via a `runNow`/`tick` port. Frontend vertical slice `features/workers/` with list + detail routes.

**Tech Stack:** Bun, tRPC, Drizzle/Postgres, React Query, TanStack Router, Astryx

**Design:** `docs/plans/2026-08-05-workers-admin-design.md`

---

### Task 1: Schema + migration for `worker_runs`

**Files:**
- Create: `apps/backend/src/db/workers/worker-run.schema.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Create: migration under `apps/backend/drizzle/` via `bun run db:generate` (from `apps/backend`)

**Step 1: Add Drizzle table**

```ts
// apps/backend/src/db/workers/worker-run.schema.ts
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type WorkerRunTrigger = "scheduled" | "manual";
export type WorkerRunStatus = "running" | "succeeded" | "failed";
export type WorkerLogLevel = "info" | "warn" | "error";
export type WorkerLogLine = {
	ts: string;
	level: WorkerLogLevel;
	message: string;
};

export const workerRuns = pgTable(
	"worker_runs",
	{
		id: text("id").primaryKey(),
		workerId: text("worker_id").notNull(),
		trigger: text("trigger").$type<WorkerRunTrigger>().notNull(),
		status: text("status").$type<WorkerRunStatus>().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		summary: text("summary"),
		error: text("error"),
		log: jsonb("log").$type<WorkerLogLine[]>().notNull().default([]),
	},
	(table) => [
		index("worker_runs_worker_id_started_at_idx").on(
			table.workerId,
			table.startedAt,
		),
		uniqueIndex("worker_runs_one_running_per_worker")
			.on(table.workerId)
			.where(sql`${table.status} = 'running'`),
	],
);
```

**Step 2: Export from schema barrel**

Add `export { workerRuns } from "./workers/worker-run.schema";` to `apps/backend/src/db/schema.ts`.

**Step 3: Generate migration**

```bash
cd apps/backend && bun run db:generate
```

Expected: new folder under `drizzle/` with `CREATE TABLE "worker_runs"` and the partial unique index.

**Step 4: Commit**

```bash
git add apps/backend/src/db/workers apps/backend/src/db/schema.ts apps/backend/drizzle
git commit -m "$(cat <<'EOF'
feat(backend): add worker_runs schema for durable WorkerRuns

EOF
)"
```

---

### Task 2: Worker run repository (TDD)

**Files:**
- Create: `apps/backend/src/workers/worker-run.repository.ts`
- Create: `apps/backend/src/workers/worker-run.repository.test.ts`

Prefer testing through an in-memory fake if DB tests are heavy in this repo; if other repos use real Postgres in tests, match that pattern. Check `*.repository.test.ts` — if none exist, put persistence behind a port and unit-test the runner with an in-memory store (Task 3), keep repository thin and lightly tested or integration-tested.

**Step 1: Define repository interface used by core**

In `workers.types.ts` (create with Task 3):

```ts
export type WorkerRunRecord = {
	id: string;
	workerId: string;
	trigger: "scheduled" | "manual";
	status: "running" | "succeeded" | "failed";
	startedAt: Date;
	finishedAt: Date | null;
	summary: string | null;
	error: string | null;
	log: WorkerLogLine[];
};

export type WorkerRunStore = {
	insertRunning(input: {
		id: string;
		workerId: string;
		trigger: "scheduled" | "manual";
		startedAt: Date;
	}): Promise<WorkerRunRecord>;
	appendLog(id: string, line: WorkerLogLine): Promise<void>;
	finish(
		id: string,
		result: {
			status: "succeeded" | "failed";
			finishedAt: Date;
			summary: string | null;
			error: string | null;
		},
	): Promise<WorkerRunRecord>;
	findRunning(workerId: string): Promise<WorkerRunRecord | null>;
	listByWorker(workerId: string, limit: number): Promise<WorkerRunRecord[]>;
	get(id: string): Promise<WorkerRunRecord | null>;
	pruneOlderThan(workerId: string, keep: number): Promise<void>;
};
```

**Step 2: In-memory store for tests** (in test helpers or `worker-run.memory.ts`)

Implement `createMemoryWorkerRunStore(): WorkerRunStore` enforcing one-running-per-worker.

**Step 3: Commit** after memory store + types exist (can land with Task 3).

---

### Task 3: Workers core — list / run / lock (TDD)

**Files:**
- Create: `apps/backend/src/workers/workers.types.ts`
- Create: `apps/backend/src/workers/workers.ts`
- Create: `apps/backend/src/workers/workers.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { createWorkers } from "./workers";
import { createMemoryWorkerRunStore } from "./worker-run.memory";

describe("workers.run", () => {
	test("starts a manual run, logs, and marks succeeded", async () => {
		const store = createMemoryWorkerRunStore();
		const lines: string[] = [];
		const workers = createWorkers({
			store,
			now: () => new Date("2026-08-05T12:00:00.000Z"),
			id: () => "run-1",
			definitions: [
				{
					id: "nightly-torrent-check",
					name: "Nightly torrent check",
					description: "Sync watches and check Topics",
					execute: async ({ log }) => {
						log("info", "start");
						lines.push("executed");
						return { summary: "ok" };
					},
				},
			],
			retainRuns: 50,
		});

		const run = await workers.run("nightly-torrent-check");

		expect(lines).toEqual(["executed"]);
		expect(run.status).toBe("succeeded");
		expect(run.trigger).toBe("manual");
		expect(run.log[0]?.level).toBe("info");
	});

	test("rejects second run while one is running", async () => {
		const store = createMemoryWorkerRunStore();
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const workers = createWorkers({
			store,
			now: () => new Date("2026-08-05T12:00:00.000Z"),
			id: () => `run-${Math.random()}`,
			definitions: [
				{
					id: "nightly-torrent-check",
					name: "Nightly torrent check",
					description: "",
					execute: async () => {
						await gate;
						return { summary: "done" };
					},
				},
			],
			retainRuns: 50,
		});

		const first = workers.run("nightly-torrent-check");
		await Bun.sleep(10);
		await expect(workers.run("nightly-torrent-check")).rejects.toThrow(
			/already running/i,
		);
		release();
		await first;
	});

	test("list shows running status from open run", async () => {
		// start long run, list() → status running, then finish → idle
	});

	test("failed execute marks run failed and stores error", async () => {
		// execute throws → status failed, error message set
	});

	test("recordScheduledRun only when pipeline actually ran", async () => {
		// workers.recordScheduled({ ran: false }) → no insert
		// workers.recordScheduled with execute path → trigger scheduled
	});
});
```

**Step 2: Run tests — expect FAIL**

```bash
cd apps/backend && bun test src/workers/workers.test.ts
```

**Step 3: Implement `createWorkers`**

Public surface roughly:

```ts
createWorkers(deps) => {
  list(): WorkerListItem[]
  get(id): WorkerDetail | null
  listRuns(workerId, limit?)
  getRun(runId)
  run(workerId): Promise<WorkerRunRecord>  // manual
  runScheduled(workerId, executeOverride?): Promise<WorkerRunRecord | null>
}
```

`run` / scheduled path: check `findRunning` → insert running → call `execute({ log })` → finish → `pruneOlderThan`.

**Step 4: Tests PASS → commit**

```bash
git add apps/backend/src/workers
git commit -m "$(cat <<'EOF'
feat(backend): add workers core with durable run lock and logs

EOF
)"
```

---

### Task 4: Nightly worker `runNow` + scheduled recording

**Files:**
- Modify: `apps/backend/src/title/watch/nightly-worker.ts`
- Modify: `apps/backend/src/title/watch/nightly-worker.test.ts`
- Modify: `apps/backend/src/title/watch/index.ts` (export if needed)
- Modify: `apps/backend/src/workers/index.ts` (composition)
- Modify: `apps/backend/src/index.ts` (wire tick → workers)

**Step 1: Failing test for `runNow`**

```ts
test("runNow syncs, enqueues, drains ignoring the night window", async () => {
	const deps = nightlyDeps({
		now: () => new Date("2026-08-02T12:00:00.000Z"), // afternoon
	});
	const worker = createNightlyWorker(deps);
	const result = await worker.runNow();
	expect(result).toEqual({ enqueued: 1, processed: 1 });
	expect(deps.calls).toEqual(["sync", "enqueue", "list", "process:task-1"]);
});
```

**Step 2: Implement `runNow`** — same body as successful `tick` without window/date-key guards. Optionally have `tick` call shared `runPipeline()` after gates.

**Step 3: Wire workers module**

- Register definition `nightly-torrent-check` whose `execute` calls `nightlyWorker.runNow()` and logs enqueued/processed (and per-task outcomes if available — at minimum summary counts).
- Change boot: instead of bare `nightlyWorker.start()`, wrap interval so when `tick()` returns `ran: true`, call `workers` to persist a scheduled run **or** change `tick` to accept an `onRan` callback. Prefer: `createNightlyWorker` stays pure; `index.ts` / `workers/index.ts` owns:

```ts
async function scheduledTick() {
  const result = await nightlyWorker.tick();
  if (!result.ran) return;
  await workers.persistExternalRun({
    workerId: "nightly-torrent-check",
    trigger: "scheduled",
    summary: `enqueued ${result.enqueued}, processed ${result.processed}`,
    log: [/* info lines */],
  });
}
```

Simpler alternative that keeps one code path: scheduled tick also goes through `workers.runScheduled("nightly-torrent-check")` which checks night window inside execute via calling `tick` logic — but then double-gating is messy.

**Recommended:**  
- `runNow()` = pipeline only.  
- `tick()` = gates + `runNow()`.  
- Manual UI → `workers.run` → `runNow` + logging inside workers execute wrapper.  
- Scheduled: after `tick()` if `ran`, call `workers.completeScheduledRun(...)` that inserts an already-finished run (or start/finish around `runNow` only when gates pass — gates live outside workers).

Cleanest scheduled hook:

```ts
// in composition
nightlyWorker.startWith(async () => {
  if (!shouldRunGates()) return; // keep inside nightlyWorker.tick
});
```

Actually keep `nightlyWorker.start()` as today, but change `tick` deps to include optional `onRun?: (result) => Promise<void>` called when `ran: true` **before** returning, and composition passes persistence. Or wrap at start site:

```ts
const stop = (() => {
  const base = createNightlyWorker(deps);
  return base.start(); // can't intercept

})();
```

**Best approach:** export `tick` and have composition own the interval:

```ts
// workers/index.ts or title composition used from app index
setInterval(async () => {
  const result = await nightlyWorker.tick();
  if (result.ran) {
    await workers.recordFinishedRun({
      workerId: "nightly-torrent-check",
      trigger: "scheduled",
      summary: `enqueued ${result.enqueued}, processed ${result.processed}`,
      log: [
        { ts: ..., level: "info", message: `Enqueued ${result.enqueued}` },
        { ts: ..., level: "info", message: `Processed ${result.processed}` },
      ],
    });
  }
}, interval);
```

And change `nightlyWorker.start()` usage in `index.ts` to the workers-owned starter so scheduled runs are recorded. Keep `start()` on nightly for tests.

For manual runs, execute wraps `runNow` and writes richer logs during execution (info at start/end).

**Step 4: Tests + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): record nightly WorkerRuns and support manual runNow

EOF
)"
```

---

### Task 5: Drizzle repository + composition + tRPC router

**Files:**
- Create: `apps/backend/src/workers/worker-run.repository.ts` (Postgres `WorkerRunStore`)
- Create: `apps/backend/src/workers/workers.router.ts`
- Create: `apps/backend/src/workers/index.ts`
- Modify: `apps/backend/src/appRouter.ts`
- Modify: `apps/backend/src/index.ts`

**Step 1: Implement Postgres store** mapping to `workerRuns` table (`crypto.randomUUID` / existing id helpers).

**Step 2: Router**

```ts
workers: {
  list: protectedProcedure.query(...)
  get: protectedProcedure.input(z.object({ id: z.string() })).query(...)
  listRuns: protectedProcedure.input(z.object({
    workerId: z.string(),
    limit: z.number().int().min(1).max(100).optional(),
  })).query(...)
  getRun: protectedProcedure.input(z.object({ runId: z.string() })).query(...)
  run: protectedProcedure.input(z.object({ workerId: z.string() })).mutation(...)
}
```

Map “already running” / unknown worker to `TRPCError` (`CONFLICT` / `NOT_FOUND`).

**Step 3: Mount on `appRouter` as `workers: workersRouter`.**

**Step 4: Manual smoke** — `bun test src/workers` + typecheck.

**Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): expose workers tRPC API with Postgres persistence

EOF
)"
```

---

### Task 6: Frontend — routes + list page

**Files:**
- Create: `apps/frontend/src/features/workers/workers-page.tsx`
- Create: `apps/frontend/src/routes/workers.tsx`
- Create: `apps/frontend/src/routes/workers.$id.tsx` (stub ok)
- Modify: `apps/frontend/src/shared/ui/navigation/navigation.tsx`
- Run route codegen if the project uses TanStack Router plugin generate (check how other routes were added — often auto on `bun run dev`).

**Step 1:** Discover UI kit: `bunx astryx build "workers list with status and run button"` and `bunx astryx component` for List/Table/StatusDot/Button used.

**Step 2:** List page via `trpc.workers.list`; Run mutation; navigate to `/workers/$id`.

**Step 3:** Nav item «Воркеры» with an appropriate lucide icon (e.g. `Cog` or `Bot`).

**Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): add /workers list with Run action

EOF
)"
```

---

### Task 7: Frontend — worker detail + run log

**Files:**
- Create: `apps/frontend/src/features/workers/worker-detail-page.tsx`
- Modify: `apps/frontend/src/routes/workers.$id.tsx`
- Optional: `apps/frontend/src/features/workers/run-log.tsx`

**Step 1:** Detail loads `get` + `listRuns`; selecting a run loads `getRun` (or include log in listRuns if small — design prefers getRun for full log).

**Step 2:** Log panel: timestamp, level (StatusDot / color token by level), message. Dense rows.

**Step 3:** While worker or selected run `running`, `refetchInterval: 2000`.

**Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): worker detail with run history and leveled logs

EOF
)"
```

---

### Task 8: ADR note + verification

**Files:**
- Modify: `docs/adr/0001-module-boundaries.md` — one short paragraph that `workers` is a top-level feature owning WorkerRun persistence and calling Title watch only via ports/composition.
- `CONTEXT.md` already updated in design commit.

**Step 1:** Run `bun test` (backend workers + nightly), `bun run check-types` if feasible.

**Step 2: Commit** docs if changed.

**Step 3:** Manual checklist:
- [ ] Open `/workers` — see nightly worker Idle
- [ ] Run → status Running → Succeeded; run appears in history
- [ ] Open run — see info log lines
- [ ] Second Run while running — button disabled / error
- [ ] Restart backend — history still present

---

## Notes for implementer

- Domain words: **Worker**, **WorkerRun**, **WatchTask**, **TitleWatch**, **Topic** — see `CONTEXT.md`.
- Do not put business logic in routers or FE routes.
- YAGNI: no cancel, no websocket, no cover/transfer workers in v1.
- TDD for workers core and `runNow`; FE can be thinner on tests if the repo lacks FE test harness.
