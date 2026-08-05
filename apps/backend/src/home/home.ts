import type {
	TitleWatchEvent,
	TitleWatchEventKind,
} from "../title/watch/title-watch-event";

export type TransferDay = {
	/** UTC calendar day, YYYY-MM-DD. */
	date: string;
	/** Traffic for this day (diff vs previous day's snapshot); null = unknown (no snapshot, gap, or counter reset). */
	downloadedBytes: number | null;
	uploadedBytes: number | null;
	/** Mean of sampled instantaneous speeds for this day (B/s); absent when no samples. */
	avgDownloadSpeed?: number | null;
	avgUploadSpeed?: number | null;
};

/**
 * Groups instantaneous speed samples by UTC day and averages them.
 * Result keys are YYYY-MM-DD day strings.
 */
export function averageSpeedsByDay(
	samples: { sampledAt: Date; downloadSpeed: number; uploadSpeed: number }[],
): Map<string, { avgDownloadSpeed: number; avgUploadSpeed: number }> {
	const sums = new Map<string, { down: number; up: number; n: number }>();
	for (const s of samples) {
		const day = s.sampledAt.toISOString().slice(0, 10);
		const acc = sums.get(day) ?? { down: 0, up: 0, n: 0 };
		acc.down += s.downloadSpeed;
		acc.up += s.uploadSpeed;
		acc.n += 1;
		sums.set(day, acc);
	}
	return new Map(
		[...sums].map(([day, acc]) => [
			day,
			{
				avgDownloadSpeed: Math.round(acc.down / acc.n),
				avgUploadSpeed: Math.round(acc.up / acc.n),
			},
		]),
	);
}

export type SpeedSamplePoint = {
	/** ISO timestamp of the reading. */
	t: string;
	downloadSpeed: number;
	uploadSpeed: number;
};

export type TransferStats = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
	/** Per-day traffic for the recent period, oldest first. */
	history?: TransferDay[];
	/** Recent instantaneous speed readings (last minutes), oldest first — seeds the live speed chart. */
	recentSpeeds?: SpeedSamplePoint[];
};

const DAY_MS = 86_400_000;

function toUtcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Builds a full day range ending at `today` from all-time counter snapshots.
 * A day gets traffic values only when both it and the previous calendar day
 * have snapshots and the counters didn't decrease (qBittorrent resets
 * all-time counters on reinstall, which would otherwise produce garbage).
 */
export function buildTransferDays(
	snapshots: { day: string; downloadedBytes: number; uploadedBytes: number }[],
	days: number,
	today: string,
): TransferDay[] {
	const byDay = new Map(snapshots.map((s) => [s.day, s]));
	const end = new Date(`${today}T00:00:00Z`);
	const result: TransferDay[] = [];

	for (let i = days - 1; i >= 0; i--) {
		const date = toUtcDay(new Date(end.getTime() - i * DAY_MS));
		const prevDate = toUtcDay(new Date(end.getTime() - (i + 1) * DAY_MS));
		const snap = byDay.get(date);
		const prev = byDay.get(prevDate);

		if (!snap || !prev) {
			result.push({ date, downloadedBytes: null, uploadedBytes: null });
			continue;
		}

		const downloaded = snap.downloadedBytes - prev.downloadedBytes;
		const uploaded = snap.uploadedBytes - prev.uploadedBytes;
		result.push({
			date,
			downloadedBytes: downloaded >= 0 ? downloaded : null,
			uploadedBytes: uploaded >= 0 ? uploaded : null,
		});
	}

	return result;
}

export type DiscoverCard = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
	/** TMDB vote average rounded to 1 decimal; `null` when unrated. */
	rating: number | null;
};

export type DiscoverFeed = {
	items: DiscoverCard[];
};

export type TitleWatchFeedItem = {
	id: string;
	titleId: string;
	kind: TitleWatchEventKind;
	message: string | null;
	createdAt: string;
};

export type TitleWatchFeed = {
	items: TitleWatchFeedItem[];
};

export type WidgetEnvelope<T> =
	| { status: "ok"; data: T }
	| { status: "unavailable" }
	| { status: "empty" };

export type ComposeWidgetRequest = {
	key: string;
	widget: string;
};

export type ComposeWidgetData = TransferStats | DiscoverFeed | TitleWatchFeed;

export type ComposeResponse = {
	widgets: Record<string, WidgetEnvelope<ComposeWidgetData>>;
};

export type HomeDeps = {
	getTransferStats: () => Promise<TransferStats | null>;
	/** Optional per-day transfer history; failures are swallowed so live stats still render. */
	getTransferHistory?: () => Promise<TransferDay[]>;
	/** Optional recent speed samples seeding the live chart; failures are swallowed. */
	getRecentSpeeds?: () => Promise<SpeedSamplePoint[]>;
	/** `null` = TMDB unavailable / error; `[]` = empty feed. */
	getDiscoverFeed: (language: string) => Promise<DiscoverCard[] | null>;
	/** Newest-first watch events for tracked TV titles; `[]` when there's nothing to show. */
	getTitleWatchEvents: () => Promise<TitleWatchEvent[]>;
};

function hasTitleId(
	event: TitleWatchEvent,
): event is TitleWatchEvent & { titleId: string } {
	return event.titleId !== null;
}

export function createHome(deps: HomeDeps) {
	return {
		compose: async ({
			widgets,
			language = "ru-RU",
		}: {
			widgets: ComposeWidgetRequest[];
			language?: string;
		}): Promise<ComposeResponse> => {
			const result: Record<string, WidgetEnvelope<ComposeWidgetData>> = {};

			for (const { key, widget } of widgets) {
				if (widget === "transferStats") {
					const stats = await deps.getTransferStats();
					if (stats === null) {
						result[key] = { status: "unavailable" };
						continue;
					}

					if (stats.downloadedBytes === 0 && stats.uploadedBytes === 0) {
						result[key] = { status: "empty" };
						continue;
					}

					const [history, recentSpeeds] = await Promise.all([
						deps.getTransferHistory
							? deps.getTransferHistory().catch(() => undefined)
							: undefined,
						deps.getRecentSpeeds
							? deps.getRecentSpeeds().catch(() => undefined)
							: undefined,
					]);

					result[key] = {
						status: "ok",
						data: {
							...stats,
							...(history ? { history } : {}),
							...(recentSpeeds ? { recentSpeeds } : {}),
						},
					};
					continue;
				}

				if (widget === "discoverFeed") {
					const items = await deps.getDiscoverFeed(language);
					if (items === null) {
						result[key] = { status: "unavailable" };
						continue;
					}
					if (items.length === 0) {
						result[key] = { status: "empty" };
						continue;
					}
					result[key] = { status: "ok", data: { items } };
					continue;
				}

				if (widget === "titleWatchFeed") {
					const events = await deps.getTitleWatchEvents();
					const items = events.filter(hasTitleId).map((event) => ({
						id: event.id,
						titleId: event.titleId,
						kind: event.kind,
						message: event.message,
						createdAt: event.createdAt,
					}));

					if (items.length === 0) {
						result[key] = { status: "empty" };
						continue;
					}

					result[key] = { status: "ok", data: { items } };
				}
			}

			return { widgets: result };
		},
	};
}

export type Home = ReturnType<typeof createHome>;
