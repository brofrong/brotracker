import { gte, lt } from "drizzle-orm";
import { db } from "../db/db";
import { transferSnapshots } from "../db/transfer/transfer-snapshot.schema";
import { transferSpeedSamples } from "../db/transfer/transfer-speed-sample.schema";
import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { logger } from "../utils/logger";
import {
	averageSpeedsByDay,
	buildTransferDays,
	type SpeedSamplePoint,
	type TransferDay,
	type TransferStats,
} from "./home";

export const TRANSFER_HISTORY_DAYS = 30;
/** Background sampling cadence — dense enough that the 1-minute live chart always has points. */
const SAMPLING_INTERVAL_MS = 15_000;
const RECENT_SPEEDS_WINDOW_MS = 600_000;
const DAY_MS = 86_400_000;

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
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

/** Logs one instantaneous speed reading; skipped when qB reports no speeds. */
export async function recordSpeedSample(
	stats: TransferStats,
	now = new Date(),
): Promise<void> {
	if (stats.downloadSpeed == null && stats.uploadSpeed == null) {
		return;
	}
	await db.insert(transferSpeedSamples).values({
		sampledAt: now,
		downloadSpeed: stats.downloadSpeed ?? 0,
		uploadSpeed: stats.uploadSpeed ?? 0,
	});
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
