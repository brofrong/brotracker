import axios, { type AxiosResponse } from "axios";
import iconv from "iconv-lite";
import { err, ok, type Result } from "neverthrow";
import parse from "node-html-parser";
import type { RutrackerOptions } from "../../tracker-interface";
import { parseTorrentId } from "../../torrent-id";
import { acquireCfClearance } from "./cf";
import { RUTRACKER_URL } from "./constants";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import {
	isRutrackerLoggedOutPage,
	rutrackerGetCookies,
	rutrackerRelogin,
} from "./login";

async function doGetImageRequest(
	rawTorrentId: string,
	options: RutrackerOptions,
	cookies: string,
	userAgent: string,
) {
	return axios.get(`${RUTRACKER_URL}/forum/viewtopic.php`, {
		params: {
			t: rawTorrentId,
		},
		responseType: "arraybuffer",
		headers: {
			Cookie: cookies,
			"User-Agent": userAgent,
		},
		timeout: 30_000,
		validateStatus: () => true,
		...axiosAgentConfig(options.proxyAgent),
	});
}

export async function rutrackerGetImage(
	torrentId: string,
	options: RutrackerOptions,
): Promise<Result<string, Error>> {
	let rawTorrentId: string;
	try {
		const parsed = parseTorrentId(torrentId);
		if (parsed.source !== "rutracker") {
			return err(new Error(`Not a RuTracker torrent id: ${torrentId}`));
		}
		rawTorrentId = parsed.rawId;
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}

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
		let response = await doGetImageRequest(
			rawTorrentId,
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
				return err(cloudflareBypassFailedError("getImage"));
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

			response = await doGetImageRequest(
				rawTorrentId,
				options,
				again.value.cookies,
				again.value.userAgent,
			);
		}

		if (isCloudflareChallenge(response)) {
			return err(cloudflareBypassFailedError("getImage"));
		}

		if (response.status >= 400) {
			return err(new Error(`getImage failed with HTTP ${response.status}`));
		}

		if (isRutrackerLoggedOutPage(iconv.decode(response.data, "windows-1251"))) {
			const relogged = await rutrackerRelogin(options);
			if (relogged.isErr()) {
				return err(relogged.error);
			}
			response = await doGetImageRequest(
				rawTorrentId,
				options,
				relogged.value.cookies,
				relogged.value.userAgent,
			);
		}

		const results = parseResponse(response);
		if (results.isErr()) {
			return err(
				new Error(`Failed to parse response ${results.error.message}`),
			);
		}
		return ok(results.value);
	} catch (error) {
		return err(new Error(`Failed to make getImage request: ${error}`));
	}
}

function parseResponse(response: AxiosResponse) {
	const root = parse(iconv.decode(response.data, "windows-1251"));

	const img = root.querySelector("#page_content .postImg");
	if (!img) {
		return err(new Error("No image found"));
	}
	return ok(img.getAttribute("title") ?? "");
}
