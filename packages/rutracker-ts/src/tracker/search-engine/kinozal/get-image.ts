import axios, { type AxiosResponse } from "axios";
import iconv from "iconv-lite";
import { err, ok, type Result } from "neverthrow";
import parse from "node-html-parser";
import type { KinozalOptions } from "../../tracker-interface";
import { parseTorrentId } from "../../torrent-id";
import { acquireKinozalCfClearance } from "./cf";
import { isKinozalSiteHostname, resolveKinozalMirror } from "./hosts";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { kinozalGetCookies } from "./login";

async function doGetImageRequest(
	rawTorrentId: string,
	options: KinozalOptions,
	cookies: string,
	userAgent: string,
) {
	const mirror = resolveKinozalMirror(options.baseUrl);
	return axios.get(`${mirror.url}/details.php`, {
		params: { id: rawTorrentId },
		responseType: "arraybuffer",
		headers: {
			Cookie: cookies,
			"User-Agent": userAgent,
		},
		validateStatus: () => true,
		...axiosAgentConfig(options.proxyAgent),
	});
}

export function parseImageUrl(
	html: string,
	siteUrl: string = resolveKinozalMirror().url,
): Result<string, Error> {
	const root = parse(html);
	const poster = root.querySelector('img[src*="/i/poster/"]');
	if (poster) {
		const src = poster.getAttribute("src")?.trim() ?? "";
		if (src) {
			try {
				return ok(new URL(src, `${siteUrl}/`).href);
			} catch {
				return ok(`${siteUrl}${src.startsWith("/") ? "" : "/"}${src}`);
			}
		}
	}

	const external = root.querySelector("img[src^='http']");
	const externalSrc = external?.getAttribute("src")?.trim();
	if (externalSrc && !isKinozalPicUrl(externalSrc)) {
		return ok(externalSrc);
	}

	return err(new Error("No image found"));
}

function isKinozalPicUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			isKinozalSiteHostname(parsed.hostname) &&
			parsed.pathname.startsWith("/pic/")
		);
	} catch {
		return false;
	}
}

export async function kinozalGetImage(
	torrentId: string,
	options: KinozalOptions,
): Promise<Result<string, Error>> {
	let rawTorrentId: string;
	try {
		const parsed = parseTorrentId(torrentId);
		if (parsed.source !== "kinozal") {
			return err(new Error(`Not a Kinozal torrent id: ${torrentId}`));
		}
		rawTorrentId = parsed.rawId;
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}

	const siteUrl = resolveKinozalMirror(options.baseUrl).url;

	const cookies = await kinozalGetCookies(
		options.auth.login,
		options.auth.password,
		options.fileStore,
		options.proxyAgent,
		options.cfSolverUrl,
		options.baseUrl,
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
			const refreshed = await acquireKinozalCfClearance({
				fileStore: options.fileStore,
				solverUrl: options.cfSolverUrl,
				baseUrl: options.baseUrl,
			});
			if (refreshed.isErr()) {
				return err(cloudflareBypassFailedError("getImage"));
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

		return parseImageFromResponse(response, siteUrl);
	} catch (error) {
		return err(new Error(`Failed to make getImage request: ${error}`));
	}
}

function parseImageFromResponse(response: AxiosResponse, siteUrl: string) {
	const html = iconv.decode(response.data, "windows-1251");
	return parseImageUrl(html, siteUrl);
}
