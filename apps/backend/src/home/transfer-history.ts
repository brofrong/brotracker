import { and, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "../db/db";
import { transferDailySpeedStats } from "../db/transfer/transfer-daily-speed-stats.schema";
import { transferSnapshots } from "../db/transfer/transfer-snapshot.schema";
import { transferSpeedSamples } from "../db/transfer/transfer-speed-sample.schema";
import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { logger } from "../utils/logger";
import {
	applyActiveSpeedSample,
	buildSpeedHistoryDays,
	type DailySpeedStatsRow,
	type SpeedHistoryDay,
} from "./daily-speed-stats";
import {
	averageSpeedsByDay,
	buildTransferDays,
	type SpeedSamplePoint,
	type TransferDay,
	type TransferStats,
} from "./home";

export const TRANSFER_HISTORY_DAYS = 30;
/** Max inclusive span for Stats page custom range (~3 years). */
export const SPEED_HISTORY_MAX_DAYS = 1096;
/** Background sampling cadence — dense enough that the 1-minute live chart always has points. */
const SAMPLING_INTERVAL_MS = 15_000;
const RECENT_SPEEDS_WINDOW_MS = 600_000;
const DAY_MS = 86_400_000;

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function toDayRow(
	row: typeof transferDailySpeedStats.$inferSelect,
): DailySpeedStatsRow {
	return {
		minDownloadSpeed: row.minDownloadSpeed,
		maxDownloadSpeed: row.maxDownloadSpeed,
		sumDownloadSpeed: row.sumDownloadSpeed,
		activeDownloadSamples: row.activeDownloadSamples,
		minUploadSpeed: row.minUploadSpeed,
		maxUploadSpeed: row.maxUploadSpeed,
		sumUploadSpeed: row.sumUploadSpeed,
		activeUploadSamples: row.activeUploadSamples,
	};
}

/** Upserts today's all-time counters; latest value for the day wins. */
export async function recordTransferSnapshot(
	stats: TransferStats,
	now = new Date(),
): Promise<void> {
	await db
		.insert(transferSnapshots)
		.values({
			day: now.toISOString().slice(0, 10),
			downloadedBytes: stats.downloadedBytes,
			uploadedBytes: stats.uploadedBytes,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: transferSnapshots.day,
			set: {
				downloadedBytes: stats.downloadedBytes,
				uploadedBytes: stats.uploadedBytes,
				updatedAt: now,
			},
		});
}

async function upsertDailySpeedStats(
	day: string,
	sample: { downloadSpeed: number; uploadSpeed: number },
	now: Date,
): Promise<void> {
	const [existing] = await db
		.select()
		.from(transferDailySpeedStats)
		.where(eq(transferDailySpeedStats.day, day))
		.limit(1);

	const next = applyActiveSpeedSample(
		existing ? toDayRow(existing) : null,
		sample,
	);
	if (!next) {
		return;
	}

	await db
		.insert(transferDailySpeedStats)
		.values({
			day,
			...next,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: transferDailySpeedStats.day,
			set: {
				...next,
				updatedAt: now,
			},
		});
}

/** Logs one instantaneous speed reading; skipped when qB reports no speeds. */
export async function recordSpeedSample(
	stats: TransferStats,
	now = new Date(),
): Promise<void> {
	if (stats.downloadSpeed == null && stats.uploadSpeed == null) {
		return;
	}
	const downloadSpeed = stats.downloadSpeed ?? 0;
	const uploadSpeed = stats.uploadSpeed ?? 0;
	await db.insert(transferSpeedSamples).values({
		sampledAt: now,
		downloadSpeed,
		uploadSpeed,
	});
	await upsertDailySpeedStats(
		now.toISOString().slice(0, 10),
		{ downloadSpeed, uploadSpeed },
		now,
	);
}

/** Keeps the speed log bounded to the history window. */
export async function pruneSpeedSamples(now = new Date()): Promise<void> {
	const cutoff = new Date(now.getTime() - (TRANSFER_HISTORY_DAYS + 1) * DAY_MS);
	await db
		.delete(transferSpeedSamples)
		.where(lt(transferSpeedSamples.sampledAt, cutoff));
}

/** Recent speed readings (last 10 minutes) to seed the live chart on page load. */
export async function getRecentSpeeds(): Promise<SpeedSamplePoint[]> {
	const since = new Date(Date.now() - RECENT_SPEEDS_WINDOW_MS);
	const rows = await db
		.select()
		.from(transferSpeedSamples)
		.where(gte(transferSpeedSamples.sampledAt, since))
		.orderBy(transferSpeedSamples.sampledAt);
	return rows.map((r) => ({
		t: r.sampledAt.toISOString(),
		downloadSpeed: r.downloadSpeed,
		uploadSpeed: r.uploadSpeed,
	}));
}

export async function getTransferHistory(): Promise<TransferDay[]> {
	const since = new Date(Date.now() - (TRANSFER_HISTORY_DAYS + 1) * DAY_MS);
	const [rows, samples] = await Promise.all([
		db
			.select()
			.from(transferSnapshots)
			.where(gte(transferSnapshots.day, since.toISOString().slice(0, 10)))
			.orderBy(transferSnapshots.day),
		db
			.select()
			.from(transferSpeedSamples)
			.where(gte(transferSpeedSamples.sampledAt, since)),
	]);

	const avgByDay = averageSpeedsByDay(samples);
	return buildTransferDays(rows, TRANSFER_HISTORY_DAYS, utcToday()).map(
		(day) => {
			const avg = avgByDay.get(day.date);
			return avg ? { ...day, ...avg } : day;
		},
	);
}

/**
 * Per-day min/avg/max active speeds for `[from, to]` (UTC days, inclusive).
 * Missing days are present with null directions.
 */
export async function getSpeedHistory(
	from: string,
	to: string,
): Promise<SpeedHistoryDay[]> {
	const rows = await db
		.select()
		.from(transferDailySpeedStats)
		.where(
			and(
				gte(transferDailySpeedStats.day, from),
				lte(transferDailySpeedStats.day, to),
			),
		)
		.orderBy(transferDailySpeedStats.day);

	return buildSpeedHistoryDays(
		rows.map((r) => ({ day: r.day, ...toDayRow(r) })),
		from,
		to,
	);
}

/**
 * When the rollup table is empty, rebuild from raw samples still retained
 * (~30 days). Safe to call on every process start — no-ops if data exists.
 */
export async function backfillDailySpeedStatsIfEmpty(): Promise<void> {
	const [any] = await db
		.select({ day: transferDailySpeedStats.day })
		.from(transferDailySpeedStats)
		.limit(1);
	if (any) {
		return;
	}

	const samples = await db
		.select()
		.from(transferSpeedSamples)
		.orderBy(transferSpeedSamples.sampledAt);
	if (samples.length === 0) {
		return;
	}

	const byDay = new Map<string, DailySpeedStatsRow>();
	for (const s of samples) {
		const day = s.sampledAt.toISOString().slice(0, 10);
		const next = applyActiveSpeedSample(byDay.get(day) ?? null, {
			downloadSpeed: s.downloadSpeed,
			uploadSpeed: s.uploadSpeed,
		});
		if (next) {
			byDay.set(day, next);
		}
	}

	const now = new Date();
	for (const [day, row] of byDay) {
		await db
			.insert(transferDailySpeedStats)
			.values({ day, ...row, updatedAt: now })
			.onConflictDoNothing();
	}

	logger.info(
		{ days: byDay.size, samples: samples.length },
		"Backfilled daily speed stats from raw samples",
	);
}

async function captureTransferState(): Promise<void> {
	const stats = await getTransferStats();
	await recordTransferSnapshot(stats);
	await recordSpeedSample(stats);
	await pruneSpeedSamples();
}

/** Samples counters and speed in the background so history accumulates while the backend is up. Returns a stop function. */
export function startTransferSnapshotScheduler(
	intervalMs: number = SAMPLING_INTERVAL_MS,
): () => void {
	void backfillDailySpeedStatsIfEmpty().catch((err: unknown) => {
		logger.warn({ err }, "Daily speed stats backfill failed");
	});

	const tick = () =>
		captureTransferState().catch((err) => {
			if (!(err instanceof QbittorrentNotConfiguredError)) {
				logger.warn({ err }, "Transfer snapshot failed");
			}
		});
	void tick();
	const interval = setInterval(tick, intervalMs);
	return () => clearInterval(interval);
}
