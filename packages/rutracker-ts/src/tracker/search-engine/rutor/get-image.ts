import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import parse from "node-html-parser";
import { parseTorrentId } from "../../torrent-id";
import { axiosAgentConfig } from "../rutracker/http";
import { isRutorSiteHostname, rutorTopicUrl } from "./hosts";
import type { RutorOptions } from "./options";

/** Rating badges and site chrome that sit next to the poster. */
const NOT_A_POSTER = /kinopoisk\.ru|imdb|cdnbunny\.org|\/thumb\//i;

/** The poster is the first external image in the release description. */
export function parseImageUrl(html: string): Result<string, Error> {
	const root = parse(html);
	for (const img of root.querySelectorAll("#details img")) {
		const src = img.getAttribute("src")?.trim() ?? "";
		const url = src.startsWith("//") ? `https:${src}` : src;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			continue;
		}
		if (isRutorSiteHostname(parsed.hostname.replace(/^s\./, ""))) continue;
		if (NOT_A_POSTER.test(url)) continue;
		return ok(parsed.href);
	}
	return err(new Error("No image found"));
}

export async function rutorGetImage(
	torrentId: string,
	options: RutorOptions,
): Promise<Result<string, Error>> {
	let rawId: string;
	try {
		const parsed = parseTorrentId(torrentId);
		if (parsed.source !== "rutor") {
			return err(new Error(`Not a RuTor torrent id: ${torrentId}`));
		}
		rawId = parsed.rawId;
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}

	try {
		const response = await axios.get<string>(rutorTopicUrl(rawId), {
			responseType: "text",
			timeout: 30_000,
			validateStatus: () => true,
			...axiosAgentConfig(options.proxyAgent),
		});
		if (response.status >= 400) {
			return err(new Error(`getImage failed with HTTP ${response.status}`));
		}
		return parseImageUrl(response.data);
	} catch (error) {
		return err(new Error(`Failed to make getImage request: ${error}`));
	}
}
