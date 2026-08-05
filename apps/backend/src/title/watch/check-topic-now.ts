import type { TitleWatchEventKind } from "./title-watch-event";
import { extractTopicId, topicTag } from "../topic-tag";
import {
	fingerprintsEqual,
	hashTorrentBytes,
	type TorrentFingerprint,
} from "./torrent-fingerprint";

export type WatchState = "tracking" | "paused" | "completed" | "off";

export type TitleWatchRecord = {
	topicUrl: string;
	titleId: string | null;
	watch: WatchState;
	source: "auto-qb" | "manual";
	size: number | null;
	registeredAt: string | null;
	contentHash: string | null;
	qbHash: string | null;
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
};

export type CheckResult =
	| { status: "unchanged"; checkedAt: string }
	| {
			status: "updated";
			checkedAt: string;
			previousSize: number;
			newSize: number;
			applied: boolean;
	  }
	| { status: "failed"; checkedAt: string; message: string };

export type TopicMeta = {
	size: number;
	registeredAt: string | null;
	torrentFileUrl: string;
};

export type RecordWatchEventInput = {
	titleId: string | null;
	topicUrl: string;
	kind: TitleWatchEventKind;
	message: string | null;
	previousSize?: number;
	newSize?: number;
};

/** Emits a feed event for #13's home widget; failures here must never break the check flow. */
export type RecordWatchEvent = (event: RecordWatchEventInput) => Promise<void>;

export type CheckTopicNowDeps = {
	loadWatch: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	saveWatch: (record: TitleWatchRecord) => Promise<void>;
	fetchTorrentBytes: (torrentFileUrl: string) => Promise<Uint8Array>;
	fetchTopicMeta: (topicUrl: string) => Promise<TopicMeta>;
	replaceInQb: (input: {
		topicId: string;
		torrentBytes: Uint8Array;
		tags: string[];
	}) => Promise<void>;
	now: () => string;
	/** Optional so callers (and older tests) that don't care about the feed keep working. */
	recordEvent?: RecordWatchEvent;
};

async function tryRecordEvent(
	recordEvent: RecordWatchEvent | undefined,
	event: RecordWatchEventInput,
): Promise<void> {
	if (!recordEvent) {
		return;
	}
	try {
		await recordEvent(event);
	} catch {
		// best-effort; feed recording must not break the check flow
	}
}

function recordFingerprint(record: TitleWatchRecord): TorrentFingerprint {
	return {
		size: record.size ?? 0,
		registeredAt: record.registeredAt,
		contentHash: record.contentHash,
	};
}

export async function checkTopicNow(
	input: { topicUrl: string },
	deps: CheckTopicNowDeps,
): Promise<CheckResult> {
	const checkedAt = deps.now();
	const existing = await deps.loadWatch(input.topicUrl);
	if (!existing) {
		return {
			status: "failed",
			checkedAt,
			message: "Follow не найден для этого topic",
		};
	}

	try {
		const topicId = extractTopicId(input.topicUrl);
		if (!topicId) {
			throw new Error("Некорректный topic URL");
		}

		const meta = await deps.fetchTopicMeta(input.topicUrl);
		const bytes = await deps.fetchTorrentBytes(meta.torrentFileUrl);
		const contentHash = await hashTorrentBytes(bytes);
		const current: TorrentFingerprint = {
			size: meta.size || existing.size || bytes.byteLength,
			registeredAt: meta.registeredAt ?? existing.registeredAt,
			contentHash,
		};

		const previous = recordFingerprint(existing);
		const hasBaseline = Boolean(existing.contentHash);

		if (!hasBaseline) {
			await deps.saveWatch({
				...existing,
				size: current.size,
				registeredAt: current.registeredAt,
				contentHash: current.contentHash,
				lastCheckedAt: checkedAt,
				lastError: null,
			});
			return { status: "unchanged", checkedAt };
		}

		if (fingerprintsEqual(previous, current)) {
			await deps.saveWatch({
				...existing,
				lastCheckedAt: checkedAt,
				lastError: null,
			});
			return { status: "unchanged", checkedAt };
		}

		await deps.replaceInQb({
			topicId,
			torrentBytes: bytes,
			tags: [topicTag(topicId)],
		});

		const previousSize = existing.size ?? 0;
		await deps.saveWatch({
			...existing,
			size: current.size,
			registeredAt: current.registeredAt,
			contentHash: current.contentHash,
			qbHash: null,
			lastCheckedAt: checkedAt,
			lastChangedAt: checkedAt,
			lastError: null,
		});

		await tryRecordEvent(deps.recordEvent, {
			titleId: existing.titleId,
			topicUrl: input.topicUrl,
			kind: "torrent-updated",
			message: null,
			previousSize,
			newSize: current.size,
		});

		return {
			status: "updated",
			checkedAt,
			previousSize,
			newSize: current.size,
			applied: true,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await deps.saveWatch({
			...existing,
			lastCheckedAt: checkedAt,
			lastError: message,
		});
		await tryRecordEvent(deps.recordEvent, {
			titleId: existing.titleId,
			topicUrl: input.topicUrl,
			kind: "check-failed",
			message,
		});
		return { status: "failed", checkedAt, message };
	}
}
