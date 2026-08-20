import axios from "axios";
import iconv from "iconv-lite";
import { err, ok, type Result } from "neverthrow";
import type {
	RutrackerOptions,
	SearchOptions,
	SearchPage,
} from "../../tracker-interface";
import { acquireCfClearance } from "./cf";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { RUTRACKER_URL } from "./constants";
import { rutrackerGetCookies } from "./login";
import { parseResponse } from "./parse";
import { createSearchOptions } from "./search-options";
import { toWindows1251Query } from "../../windows-1251-query";

async function doSearchRequest(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutrackerOptions,
	cookies: string,
	userAgent: string,
) {
	const searchOptions = createSearchOptions(query, queryOptions);
	return axios.get(`${RUTRACKER_URL}/forum/tracker.php`, {
		params: searchOptions,
		paramsSerializer: toWindows1251Query,
		responseType: "arraybuffer",
		headers: {
			Cookie: cookies,
			"User-Agent": userAgent,
		},
		validateStatus: () => true,
		...axiosAgentConfig(options.proxyAgent),
	});
}

export async function makeSearchRequest(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutrackerOptions,
) {
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
		let response = await doSearchRequest(
			query,
			queryOptions,
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
				return err(cloudflareBypassFailedError("search"));
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

			response = await doSearchRequest(
				query,
				queryOptions,
				options,
				again.value.cookies,
				again.value.userAgent,
			);
		}

		if (isCloudflareChallenge(response)) {
			return err(cloudflareBypassFailedError("search"));
		}

		if (response.status >= 400) {
			return err(
				new Error(`Search request failed with HTTP ${response.status}`),
			);
		}

		const html = iconv.decode(response.data, "windows-1251");
		return ok(html);
	} catch (error) {
		return err(new Error(`Failed to make search request: ${error}`));
	}
}

export async function rutrackerSearch(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutrackerOptions,
): Promise<Result<SearchPage, Error>> {
	const response = await makeSearchRequest(query, queryOptions, options);
	if (response.isErr()) {
		return err(response.error);
	}

	const results = parseResponse(response.value);
	if (results.isErr()) {
		return err(new Error(`Failed to parse response: ${results.error.message}`));
	}
	return ok(results.value);
}
