import { topicTag } from "./topic-tag";

export class ReplaceTorrentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReplaceTorrentError";
	}
}

export type ReplaceQbTorrent = {
	hash: string;
	savePath: string;
	tags: string;
};

export type ReplaceTorrentInQbDeps = {
	listTorrents: () => Promise<ReplaceQbTorrent[]>;
	deleteTorrent: (
		hash: string,
		options: { deleteFiles: boolean },
	) => Promise<void>;
	addTorrent: (
		bytes: Uint8Array,
		options: { pathToSave: string; tags?: string[] },
	) => Promise<void>;
	getSeriesPath: () => Promise<string | null>;
};

function tagsIncludeTopic(tags: string, topicId: string): boolean {
	const needle = topicTag(topicId);
	return tags
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.includes(needle);
}

export function createReplaceTorrentInQb(deps: ReplaceTorrentInQbDeps) {
	return async function replaceTorrentInQb(input: {
		topicId: string;
		torrentBytes: Uint8Array;
		tags: string[];
	}): Promise<void> {
		const seriesPath = await deps.getSeriesPath();
		if (!seriesPath) {
			throw new ReplaceTorrentError(
				"Путь для сериалов не задан в настройках",
			);
		}

		const torrents = await deps.listTorrents();
		const existing = torrents.find((torrent) =>
			tagsIncludeTopic(torrent.tags, input.topicId),
		);

		if (existing) {
			await deps.deleteTorrent(existing.hash, { deleteFiles: false });
		}

		await deps.addTorrent(input.torrentBytes, {
			pathToSave: existing?.savePath ?? seriesPath,
			tags: input.tags,
		});
	};
}
