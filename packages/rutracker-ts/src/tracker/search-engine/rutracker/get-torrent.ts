import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import type { RutrackerOptions } from "../../tracker-interface";
import { acquireCfClearance } from "./cf";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { rutrackerGetCookies } from "./login";

export function isTorrentPayload(buf: Uint8Array): boolean {
	return buf.length > 0 && buf[0] === 0x64;
}

function toUint8Array(data: ArrayBuffer | Buffer): Uint8Array {
	return new Uint8Array(data);
}

async function doGetTorrentRequest(
	torrentFileUrl: string,
	options: RutrackerOptions,
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

export async function rutrackerGetTorrent(
	torrentFileUrl: string,
	options: RutrackerOptions,
): Promise<Result<Uint8Array, Error>> {
	const cookies = await rutrackerGetCookies(
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
			const refreshed = await acquireCfClearance({
				fileStore: options.fileStore,
				solverUrl: options.cfSolverUrl,
			});
			if (refreshed.isErr()) {
				return err(cloudflareBypassFailedError("getTorrent"));
			}

			const again = await rutrackerGetCookies(
				options.auth.login,
				options.auth.password,
				options.fileStore,
				options.proxyAgent,
				options.cfSolverUrl,
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
