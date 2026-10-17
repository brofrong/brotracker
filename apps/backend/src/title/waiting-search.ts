import type { WatchlistSettings } from "../settings/watchlist-settings";
import { type PickTarget, pickRelease } from "./release-pick";
import type {
	TaggedQbTorrent,
	TitleKind,
	TitleTorrentCandidate,
} from "./title.types";
import { extractTopicId, findTransferForTopic, topicTag } from "./topic-tag";
import type {
	RecordWatchEventInput,
	TitleWatchRecord,
} from "./watch/check-topic-now";

export type WaitingTarget = PickTarget & { queries: string[] };

export type WaitingSearchDeps = {
	listWaiting: () => Promise<TitleWatchRecord[]>;
	listDownloading: () => Promise<TitleWatchRecord[]>;
	loadWatchById: (id: string) => Promise<TitleWatchRecord | null>;
	loadWatchByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	saveWatch: (r: TitleWatchRecord) => Promise<void>;
	deleteWatch: (id: string) => Promise<void>;
	loadTarget: (watch: TitleWatchRecord) => Promise<WaitingTarget | null>;
	/** Throws when trackers are unavailable. */
	searchTracker: (query: string) => Promise<TitleTorrentCandidate[]>;
	loadRules: () => Promise<WatchlistSettings>;
	addToQb: (
		torrentFileUrl: string,
		kind: TitleKind,
		tags: string[],
	) => Promise<void>;
	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
	recordEvent: (e: RecordWatchEventInput) => Promise<void>;
	now: () => string;
};

export type WaitingSearchRun = {
	checked: number;
	started: number;
	failed: number;
};

/** What happened to one waiting watch; drives run counters and log lines. */
type CheckOutcome =
	| { kind: "started"; record: TitleWatchRecord }
	| { kind: "merged"; record: TitleWatchRecord }
	| { kind: "waiting"; record: TitleWatchRecord }
	| { kind: "failed"; record: TitleWatchRecord };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function describeWatch(watch: TitleWatchRecord): string {
	return watch.titleName ?? watch.titleId ?? watch.id;
}

function describeOutcome(outcome: CheckOutcome): string {
	switch (outcome.kind) {
		case "started":
			return `started (${outcome.record.watch})`;
		case "merged":
			return "merged into existing watch";
		case "waiting":
		case "failed": {
			const { waitingOutcome, waitingOutcomeDetail, lastError } =
				outcome.record;
			const reason = lastError ?? waitingOutcomeDetail;
			const label = waitingOutcome ?? "add-failed";
			return reason ? `${label}: ${reason}` : label;
		}
	}
}

/**
 * «Жду»: searches trackers for each waiting watch, starts the first release
 * that passes the watchlist rules, and marks downloaded films completed.
 */
export function createWaitingSearch(deps: WaitingSearchDeps) {
	async function tryRecordEvent(event: RecordWatchEventInput): Promise<void> {
		try {
			await deps.recordEvent(event);
		} catch {
			// best-effort; feed recording must not break the search flow
		}
	}

	async function searchAll(
		queries: string[],
	): Promise<TitleTorrentCandidate[]> {
		const byTorrentId = new Map<string, TitleTorrentCandidate>();
		for (const query of queries) {
			for (const found of await deps.searchTracker(query)) {
				if (!byTorrentId.has(found.torrentId)) {
					byTorrentId.set(found.torrentId, found);
				}
			}
		}
		return [...byTorrentId.values()];
	}

	async function markFailed(
		watch: TitleWatchRecord,
		message: string,
		checkedAt: string,
	): Promise<CheckOutcome> {
		const record: TitleWatchRecord = {
			...watch,
			waitingOutcome: "search-failed",
			waitingOutcomeDetail: null,
			lastCheckedAt: checkedAt,
			lastError: message,
		};
		await deps.saveWatch(record);
		return { kind: "failed", record };
	}

	/** The topic is already watched by another row: hand it the Title and drop this one. */
	async function mergeIntoOwner(
		watch: TitleWatchRecord,
		owner: TitleWatchRecord,
	): Promise<CheckOutcome> {
		const record: TitleWatchRecord = {
			...owner,
			titleId: watch.titleId,
			kind: watch.kind,
			titleName: watch.titleName,
			poster: watch.poster,
			year: watch.year,
		};
		await deps.saveWatch(record);
		await deps.deleteWatch(watch.id);
		return { kind: "merged", record };
	}

	async function startDownload(
		watch: TitleWatchRecord,
		release: TitleTorrentCandidate,
		kind: TitleKind,
		checkedAt: string,
	): Promise<CheckOutcome> {
		const owner = await deps.loadWatchByTopicUrl(release.topicUrl);
		if (owner && owner.id !== watch.id) {
			return mergeIntoOwner(watch, owner);
		}

		try {
			const topicId = extractTopicId(release.topicUrl);
			if (!topicId) {
				throw new Error("Некорректный topic URL");
			}
			await deps.addToQb(release.torrentFileUrl, kind, [topicTag(topicId)]);
		} catch (error) {
			const message = errorMessage(error);
			const record: TitleWatchRecord = {
				...watch,
				waitingOutcome: null,
				waitingOutcomeDetail: null,
				lastCheckedAt: checkedAt,
				lastError: message,
			};
			await deps.saveWatch(record);
			await tryRecordEvent({
				titleId: watch.titleId,
				topicUrl: release.topicUrl,
				kind: "add-failed",
				message,
			});
			return { kind: "failed", record };
		}

		const record: TitleWatchRecord = {
			...watch,
			kind,
			topicUrl: release.topicUrl,
			watch: kind === "films" ? "downloading" : "tracking",
			source: "manual",
			size: release.size,
			qbHash: null,
			lastCheckedAt: checkedAt,
			lastChangedAt: checkedAt,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
		};
		await deps.saveWatch(record);
		await tryRecordEvent({
			titleId: watch.titleId,
			topicUrl: release.topicUrl,
			kind: "download-started",
			message: release.title,
			newSize: release.size,
		});
		return { kind: "started", record };
	}

	async function check(
		watch: TitleWatchRecord,
		rules: WatchlistSettings,
	): Promise<CheckOutcome> {
		const checkedAt = deps.now();
		const target = await deps.loadTarget(watch);
		if (!target) {
			return markFailed(watch, "Нет данных о тайтле для поиска", checkedAt);
		}

		let candidates: TitleTorrentCandidate[];
		try {
			candidates = await searchAll(target.queries);
		} catch (error) {
			return markFailed(watch, errorMessage(error), checkedAt);
		}

		const pick = pickRelease(candidates, target, rules);
		if (pick.status === "found") {
			return startDownload(watch, pick.candidate, target.kind, checkedAt);
		}

		const record: TitleWatchRecord = {
			...watch,
			waitingOutcome: pick.outcome,
			waitingOutcomeDetail: pick.detail,
			lastCheckedAt: checkedAt,
			lastError: null,
		};
		await deps.saveWatch(record);
		return { kind: "waiting", record };
	}

	return {
		async runAll(log?: (line: string) => void): Promise<WaitingSearchRun> {
			const run: WaitingSearchRun = { checked: 0, started: 0, failed: 0 };
			const waiting = await deps.listWaiting();
			if (waiting.length === 0) return run;
			const rules = await deps.loadRules();

			for (const watch of waiting) {
				run.checked += 1;
				let line: string;
				try {
					const outcome = await check(watch, rules);
					if (outcome.kind === "started") run.started += 1;
					if (outcome.kind === "failed") run.failed += 1;
					line = describeOutcome(outcome);
				} catch (error) {
					run.failed += 1;
					line = `error: ${errorMessage(error)}`;
				}
				log?.(`${describeWatch(watch)}: ${line}`);
			}
			return run;
		},

		async checkOne(watchId: string): Promise<TitleWatchRecord | null> {
			const watch = await deps.loadWatchById(watchId);
			if (!watch || watch.watch !== "waiting") return null;
			const rules = await deps.loadRules();
			const outcome = await check(watch, rules);
			return outcome.record;
		},

		async syncDownloads(): Promise<{ completed: number }> {
			const films = (await deps.listDownloading()).filter(
				(watch) => watch.kind === "films" && watch.topicUrl !== null,
			);
			if (films.length === 0) return { completed: 0 };

			const torrents = await deps.listTaggedTorrents();
			let completed = 0;
			for (const watch of films) {
				const topicUrl = watch.topicUrl;
				const topicId = topicUrl ? extractTopicId(topicUrl) : null;
				if (!topicId) continue;
				const transfer = findTransferForTopic(topicId, torrents);
				if (!transfer || transfer.progress < 1) continue;

				await deps.saveWatch({
					...watch,
					watch: "completed",
					lastChangedAt: deps.now(),
				});
				await tryRecordEvent({
					titleId: watch.titleId,
					topicUrl,
					kind: "downloaded",
					message: null,
				});
				completed += 1;
			}
			return { completed };
		},
	};
}
