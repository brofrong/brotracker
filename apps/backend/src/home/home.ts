import type {
	TitleWatchEvent,
	TitleWatchEventKind,
} from "../title/title-watch-event";

export type TransferStats = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
};

export type DiscoverCard = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
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
	/** `null` = TMDB unavailable / error; `[]` = empty feed. */
	getDiscoverFeed: () => Promise<DiscoverCard[] | null>;
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
		}: {
			widgets: ComposeWidgetRequest[];
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

					result[key] = { status: "ok", data: stats };
					continue;
				}

				if (widget === "discoverFeed") {
					const items = await deps.getDiscoverFeed();
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
