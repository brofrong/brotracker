import axios from "axios";
import { err, ok, type Result } from "neverthrow";

import { isTorrentPayload } from "../rutracker/get-torrent";
import { axiosAgentConfig } from "../rutracker/http";
import { rutorDownloadId, rutorDownloadUrl } from "./hosts";
import type { RutorOptions } from "./options";
import { paced } from "./pacing";

export async function rutorGetTorrent(
	torrentFileUrl: string,
	options: RutorOptions,
): Promise<Result<Uint8Array, Error>> {
	const rawId = rutorDownloadId(torrentFileUrl);
	if (!rawId) {
		return err(new Error(`Not a RuTor download URL: ${torrentFileUrl}`));
	}

	try {
		const response = await paced(() =>
			axios.get(rutorDownloadUrl(rawId), {
				responseType: "arraybuffer",
				timeout: 30_000,
				validateStatus: () => true,
				...axiosAgentConfig(options.proxyAgent),
			}),
		);
		if (response.status >= 400) {
			return err(new Error(`getTorrent failed with HTTP ${response.status}`));
		}
		const bytes = new Uint8Array(response.data);
		if (!isTorrentPayload(bytes)) {
			return err(new Error("getTorrent: RuTor did not return a torrent file"));
		}
		return ok(bytes);
	} catch (error) {
		return err(new Error(`Failed to make getTorrent request: ${error}`));
	}
}
