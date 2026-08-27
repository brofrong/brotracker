import {
	DEFAULT_KINOZAL_MIRROR,
	KINOZAL_MIRRORS,
} from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import { fetchWithProxy } from "../http/fetch-with-proxy";
import { logger } from "../utils/logger";

const PROBE_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;

export type MirrorProbe = {
	url: string;
	latencyMs: number;
};

/** Pure: pick the fastest successful probe; null when none responded. */
export function pickFastestMirror(
	probes: Array<MirrorProbe | null>,
): MirrorProbe | null {
	const okProbes = probes.filter((probe): probe is MirrorProbe => probe !== null);
	return (
		okProbes.sort((a, b) => a.latencyMs - b.latencyMs)[0] ?? null
	);
}

let cached: { url: string; probedAt: number } | null = null;

async function probeMirror(
	url: string,
	proxyUrl: string | null,
): Promise<MirrorProbe | null> {
	const startedAt = Date.now();
	try {
		const response = await Promise.race([
			fetchWithProxy(`${url}/`, {
				headers: { Accept: "text/html" },
				proxyUrl,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`probe timeout for ${url}`)),
					PROBE_TIMEOUT_MS,
				),
			),
		]);
		if (!response.ok) {
			return null;
		}
		return { url, latencyMs: Date.now() - startedAt };
	} catch {
		return null;
	}
}

/**
 * Probe all Kinozal mirrors in parallel and return the fastest one.
 * Falls back to the default mirror when none respond. Cached for 5 minutes.
 */
export async function probeFastestKinozalMirror(
	proxyUrl: string | null = null,
): Promise<string> {
	if (cached && Date.now() - cached.probedAt < CACHE_TTL_MS) {
		return cached.url;
	}

	const probes = await Promise.all(
		KINOZAL_MIRRORS.map((mirror) => probeMirror(mirror.url, proxyUrl)),
	);
	const winner = pickFastestMirror(probes);
	const url = winner?.url ?? DEFAULT_KINOZAL_MIRROR.url;

	cached = { url, probedAt: Date.now() };
	logger.info(
		{ url, latencyMs: winner?.latencyMs ?? null },
		"kinozal mirror auto-selected",
	);
	return url;
}

/** Drop the cached probe result so the next resolution re-probes. */
export function resetKinozalMirrorProbe(): void {
	cached = null;
}
