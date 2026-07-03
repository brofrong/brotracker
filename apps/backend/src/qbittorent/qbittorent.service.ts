import { addTorrent, getTorrents } from "./qbittorent.client";
import type { AddTorrentOptions } from "./qbittorent.types";

export const qbittorentService = {
	getTorrents,
	addTorrent: (
		torrentFileOrMagnetLink: string,
		options: AddTorrentOptions,
	) => addTorrent(torrentFileOrMagnetLink, options),
};
