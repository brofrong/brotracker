import axios, { type AxiosResponse } from "axios";
import iconv from "iconv-lite";
import { err, ok, type Result } from "neverthrow";
import parse from "node-html-parser";
import type { RutrackerOptions } from "../../tracker-interface";
import { acquireCfClearance } from "./cf";
import { RUTRACKER_URL } from "./constants";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { rutrackerGetCookies } from "./login";

async function doGetImageRequest(
	torrentId: string,
	options: RutrackerOptions,
	cookies: string,
	userAgent: string,
) {
	return axios.get(`${RUTRACKER_URL}/forum/viewtopic.php`, {
		params: {
			t: torrentId,
		},
		responseType: "arraybuffer",
		headers: {
			Cookie: cookies,
			"User-Agent": userAgent,
		},
		validateStatus: () => true,
		...axiosAgentConfig(options.proxyAgent),
	});
}

export async function rutrackerGetImage(
	torrentId: string,
	options: RutrackerOptions,
): Promise<Result<string, Error>> {
	const cookies = await rutrackerGetCookies(
		options.auth.login,
		options.auth.password,
		options.fileStore,
		options.proxyAgent,
		options.cfHeadless,
	);
	if (!cookies.isOk()) {
		return err(cookies.error);
	}

	try {
		let response = await doGetImageRequest(
			torrentId,
			options,
			cookies.value.cookies,
			cookies.value.userAgent,
		);

		if (isCloudflareChallenge(response)) {
			const refreshed = await acquireCfClearance({
				fileStore: options.fileStore,
				...(options.cfHeadless !== undefined
					? { headless: options.cfHeadless }
					: {}),
			});
			if (refreshed.isErr()) {
				return err(cloudflareBypassFailedError("getImage"));
			}

			const again = await rutrackerGetCookies(
				options.auth.login,
				options.auth.password,
				options.fileStore,
				options.proxyAgent,
				options.cfHeadless,
			);
			if (again.isErr()) {
				return err(again.error);
			}

			response = await doGetImageRequest(
				torrentId,
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
