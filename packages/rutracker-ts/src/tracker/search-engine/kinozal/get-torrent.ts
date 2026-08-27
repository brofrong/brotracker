import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import type { KinozalOptions } from "../../tracker-interface";
import { isTorrentPayload } from "../rutracker/get-torrent";
import { acquireKinozalCfClearance } from "./cf";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { KINOZAL_DL_URL } from "./constants";
import { kinozalGetCookies } from "./login";

export { isTorrentPayload };

const ALLOWED_DOWNLOAD = new RegExp(
	`^${KINOZAL_DL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/download\\.php\\?id=\\d+$`,
);

function toUint8Array(data: ArrayBuffer | Buffer): Uint8Array {
	return new Uint8Array(data);
}

async function doGetTorrentRequest(
	torrentFileUrl: string,
	options: KinozalOptions,
	cookies: string,
	userAgent: string,
) {
	return axios.get(torrentFileUrl, {
		responseType: "arraybuffer",
		headers: {
			Cookie: cookies,
			"User-Agent": userAgent,
		},
		validateStatus: () => true,
		...axiosAgentConfig(options.proxyAgent),
	});
}

export async function kinozalGetTorrent(
	torrentFileUrl: string,
	options: KinozalOptions,
): Promise<Result<Uint8Array, Error>> {
	if (!ALLOWED_DOWNLOAD.test(torrentFileUrl)) {
		return err(new Error(`Torrent URL not allowlisted: ${torrentFileUrl}`));
	}

	const cookies = await kinozalGetCookies(
		options.auth.login,
		options.auth.password,
		options.fileStore,
		options.proxyAgent,
		options.cfSolverUrl,
	);
	if (!cookies.isOk()) {
		return err(cookies.error);
	}

	try {
		let response = await doGetTorrentRequest(
			torrentFileUrl,
			options,
			cookies.value.cookies,
			cookies.value.userAgent,
		);

		if (isCloudflareChallenge(response)) {
			const refreshed = await acquireKinozalCfClearance({
				fileStore: options.fileStore,
				solverUrl: options.cfSolverUrl,
				baseUrl: options.baseUrl,
			});
			if (refreshed.isErr()) {
				return err(cloudflareBypassFailedError("getTorrent"));
			}

			const again = await kinozalGetCookies(
				options.auth.login,
				options.auth.password,
				options.fileStore,
				options.proxyAgent,
				options.cfSolverUrl,
				options.baseUrl,
			);
			if (again.isErr()) {
				return err(again.error);
			}

			response = await doGetTorrentRequest(
				torrentFileUrl,
				options,
				again.value.cookies,
				again.value.userAgent,
			);
		}

		if (isCloudflareChallenge(response)) {
			return err(cloudflareBypassFailedError("getTorrent"));
		}

		if (response.status >= 400) {
			return err(new Error(`getTorrent failed with HTTP ${response.status}`));
		}

		const payload = toUint8Array(response.data);
		if (!isTorrentPayload(payload)) {
			return err(new Error("Response does not look like a torrent file"));
		}

		return ok(payload);
	} catch (error) {
		return err(new Error(`Failed to make getTorrent request: ${error}`));
	}
}
