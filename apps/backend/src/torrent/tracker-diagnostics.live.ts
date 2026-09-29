import {
	DEFAULT_KINOZAL_MIRROR,
	KINOZAL_MIRRORS,
} from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";
import { fetchWithProxy } from "../http/fetch-with-proxy";
import {
	loadKinozalConfig,
	loadRutrackerConfig,
} from "../settings/provider-config.live";
import { getTracker, TrackerNotConfiguredError } from "./torrent.tracker";
import {
	createTrackerDiagnostics,
	type ProbeResult,
} from "./tracker-diagnostics";
import { classifyNetworkError, errorMessage } from "./tracker-error";

const PROBE_TIMEOUT_MS = 10_000;

async function probe(
	url: string,
	proxyUrl: string | null,
): Promise<ProbeResult> {
	const startedAt = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		// fetchWithProxy has no abort support on the socks path, so race a timer.
		const response = await Promise.race([
			fetchWithProxy(url, { headers: { Accept: "text/html" }, proxyUrl }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new DOMException(
								`No response within ${PROBE_TIMEOUT_MS / 1000}s`,
								"TimeoutError",
							),
						),
					PROBE_TIMEOUT_MS,
				);
			}),
		]);
		await response.body?.cancel();
		return { ok: true, latencyMs: Date.now() - startedAt };
	} catch (error) {
		return {
			ok: false,
			code: classifyNetworkError(error),
			detail: errorMessage(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export const trackerDiagnostics = createTrackerDiagnostics({
	egressUrl: "https://www.cloudflare.com/cdn-cgi/trace",
	probe,
	loadTarget: async (source) => {
		if (source === "rutracker") {
			const config = await loadRutrackerConfig();
			if (!config) {
				throw new TrackerNotConfiguredError(source);
			}
			return {
				proxyUrl: config.proxyUrl,
				hosts: [
					{ url: `${RUTRACKER_URL}/forum/index.php`, label: "rutracker.org" },
				],
			};
		}

		const config = await loadKinozalConfig();
		if (!config) {
			throw new TrackerNotConfiguredError(source);
		}
		const mirrors = config.autoHost
			? KINOZAL_MIRRORS
			: [
					KINOZAL_MIRRORS.find((mirror) => mirror.url === config.host) ??
						DEFAULT_KINOZAL_MIRROR,
				];
		return {
			proxyUrl: config.proxyUrl,
			hosts: mirrors.map((mirror) => ({
				url: `${mirror.url}/`,
				label: mirror.label,
			})),
		};
	},
	checkLogin: async (source) => {
		try {
			const tracker = await getTracker(source);
			const result = await tracker._getHTML("test", {});
			return result.isErr()
				? { ok: false, message: result.error.message }
				: { ok: true };
		} catch (error) {
			if (error instanceof TrackerNotConfiguredError) {
				throw error;
			}
			return { ok: false, message: errorMessage(error) };
		}
	},
});
