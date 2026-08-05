/** Mutable accumulator for one UTC day's active Transfer speed samples. */
export type DailySpeedStatsRow = {
	minDownloadSpeed: number | null;
	maxDownloadSpeed: number | null;
	sumDownloadSpeed: number;
	activeDownloadSamples: number;
	minUploadSpeed: number | null;
	maxUploadSpeed: number | null;
	sumUploadSpeed: number;
	activeUploadSamples: number;
};

export type SpeedExtremes = {
	min: number;
	avg: number;
	max: number;
};

export type SpeedHistoryDay = {
	/** UTC calendar day, YYYY-MM-DD. */
	date: string;
	download: SpeedExtremes | null;
	upload: SpeedExtremes | null;
};

const DAY_MS = 86_400_000;

function emptyRow(): DailySpeedStatsRow {
	return {
		minDownloadSpeed: null,
		maxDownloadSpeed: null,
		sumDownloadSpeed: 0,
		activeDownloadSamples: 0,
		minUploadSpeed: null,
		maxUploadSpeed: null,
		sumUploadSpeed: 0,
		activeUploadSamples: 0,
	};
}

/**
 * Folds one instantaneous sample into a day accumulator.
 * Only speeds > 0 count toward that direction's min/avg/max.
 * Returns null when `existing` is null and the sample is fully idle.
 */
export function applyActiveSpeedSample(
	existing: DailySpeedStatsRow | null,
	sample: { downloadSpeed: number; uploadSpeed: number },
): DailySpeedStatsRow | null {
	const downActive = sample.downloadSpeed > 0;
	const upActive = sample.uploadSpeed > 0;
	if (!downActive && !upActive) {
		return existing;
	}

	const row = existing ? { ...existing } : emptyRow();

	if (downActive) {
		const v = sample.downloadSpeed;
		row.minDownloadSpeed =
			row.minDownloadSpeed == null ? v : Math.min(row.minDownloadSpeed, v);
		row.maxDownloadSpeed =
			row.maxDownloadSpeed == null ? v : Math.max(row.maxDownloadSpeed, v);
		row.sumDownloadSpeed += v;
		row.activeDownloadSamples += 1;
	}

	if (upActive) {
		const v = sample.uploadSpeed;
		row.minUploadSpeed =
			row.minUploadSpeed == null ? v : Math.min(row.minUploadSpeed, v);
		row.maxUploadSpeed =
			row.maxUploadSpeed == null ? v : Math.max(row.maxUploadSpeed, v);
		row.sumUploadSpeed += v;
		row.activeUploadSamples += 1;
	}

	return row;
}

function extremesFrom(
	min: number | null,
	max: number | null,
	sum: number,
	count: number,
): SpeedExtremes | null {
	if (count <= 0 || min == null || max == null) {
		return null;
	}
	return { min, avg: Math.round(sum / count), max };
}

export function dayStatsToApi(row: DailySpeedStatsRow): {
	download: SpeedExtremes | null;
	upload: SpeedExtremes | null;
} {
	return {
		download: extremesFrom(
			row.minDownloadSpeed,
			row.maxDownloadSpeed,
			row.sumDownloadSpeed,
			row.activeDownloadSamples,
		),
		upload: extremesFrom(
			row.minUploadSpeed,
			row.maxUploadSpeed,
			row.sumUploadSpeed,
			row.activeUploadSamples,
		),
	};
}

type StoredDay = DailySpeedStatsRow & { day: string };

/**
 * Builds a contiguous UTC day range `[from, to]` inclusive.
 * Days without a stored row get null download/upload.
 */
export function buildSpeedHistoryDays(
	rows: StoredDay[],
	from: string,
	to: string,
): SpeedHistoryDay[] {
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const start = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	const result: SpeedHistoryDay[] = [];

	for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
		const date = new Date(t).toISOString().slice(0, 10);
		const row = byDay.get(date);
		if (!row) {
			result.push({ date, download: null, upload: null });
			continue;
		}
		const { download, upload } = dayStatsToApi(row);
		result.push({ date, download, upload });
	}

	return result;
}
